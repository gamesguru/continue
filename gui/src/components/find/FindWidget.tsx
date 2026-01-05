import {
  ArrowDownIcon,
  ArrowUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VirtuosoHandle } from "react-virtuoso";
import { HeaderButton, Input } from "..";
import { ChatHistoryItemWithMessageId } from "../../redux/slices/sessionSlice";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";
import {
  Rectangle,
  SearchMatch,
  searchWithinContainer,
} from "./findWidgetSearch";
import { useDebounceValue } from "./useDebounce";
import { useElementSize } from "./useElementSize";

interface HighlightOverlayProps {
  rectangle: Rectangle;
  isCurrent: boolean;
}

const HighlightOverlay = (props: HighlightOverlayProps) => {
  const { top, left, width, height } = props.rectangle;
  return (
    <div
      className={props.isCurrent ? "bg-findMatch-selected" : "bg-findMatch"}
      key={`highlight-${top}-${left}`}
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        pointerEvents: "none", // To click through the overlay
        zIndex: 10,
      }}
    />
  );
};

type ScrollToMatchOption = "closest" | "first" | "none";

/*
    useFindWidget takes a container ref and returns
    1. A widget that can be placed anywhere to search the contents of that container
    2. Search results and state
    3. Highlight components to be overlayed over the container

    Container must have relative positioning
*/
export const useFindWidget = (
  virtuosoRef: RefObject<VirtuosoHandle>,
  searchRef: RefObject<HTMLDivElement>,
  headerRef: RefObject<HTMLDivElement>,
  history: ChatHistoryItemWithMessageId[],
  disabled: boolean,
) => {
  // Search input, debounced
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentValue, setCurrentValue] = useState<string>("");
  const searchTerm = useDebounceValue(currentValue, 300);

  // Widget open/closed state
  const [open, setOpen] = useState<boolean>(false);
  const openWidget = useCallback(() => {
    setOpen(true);
    inputRef?.current?.select();
  }, [inputRef]);

  // Search settings and results
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [useRegex, setUseRegex] = useState<boolean>(false);

  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState<SearchMatch | undefined>(
    undefined,
  );

  // Navigating between search results
  // The "current" search result is highlighted a different color
  const scrollToMatch = useCallback(
    (match: SearchMatch) => {
      setCurrentMatch(match);
      if (match.messageIndex !== undefined && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: match.messageIndex,
          align: "center",
        });
      }
    },
    [searchRef, virtuosoRef],
  );

  const nextMatch = useCallback(() => {
    if (!currentMatch || matches.length === 0) return;
    const newIndex = (currentMatch.index + 1) % matches.length;
    const newMatch = matches[newIndex];
    scrollToMatch(newMatch);
  }, [scrollToMatch, currentMatch, matches]);

  const previousMatch = useCallback(() => {
    if (!currentMatch || matches.length === 0) return;
    const newIndex =
      currentMatch.index === 0 ? matches.length - 1 : currentMatch.index - 1;
    const newMatch = matches[newIndex];
    scrollToMatch(newMatch);
  }, [scrollToMatch, currentMatch, matches]);

  // Handle keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        openWidget();
      } else if (document.activeElement === inputRef.current) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) previousMatch();
          else nextMatch();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputRef, matches, nextMatch]);

  // Handle container resize changes - highlight positions must adjust
  const { clientHeight: headerHeight, isResizing: headerResizing } =
    useElementSize(headerRef);
  const { isResizing: containerResizing } = useElementSize(searchRef);
  const isResizing = useMemo(() => {
    return containerResizing || headerResizing;
  }, [containerResizing, headerResizing]);

  // Visual highlights for currently visible items
  const [visibleHighlights, setVisibleHighlights] = useState<SearchMatch[]>([]);

  // Update visible highlights when scrolling or content changes
  useEffect(() => {
    if (!open || disabled) {
      setVisibleHighlights([]);
      return;
    }

    // We can't easily debounce this vs the render cycle, but we try:
    const updateHighlights = () => {
      const { results } = searchWithinContainer(searchRef, searchTerm, {
        caseSensitive,
        useRegex,
        offsetHeight: headerHeight,
      });
      setVisibleHighlights(results);
    };

    // Initial update
    updateHighlights();

    // Interval to keep highlights roughly synced with scrolling?
    // Virtuoso handles scrolling, so the DOM changes.
    // Ideally we'd bind to Virtuoso's scroll event, but we don't have it easily here exposed.
    // relying on the parent to re-render might not happen on just scroll?
    // The parent Chat.tsx renders, but updating this hook...
    // We'll set an interval or rely on searchRef click hack existing + maybe a poll?
    const interval = setInterval(updateHighlights, 250);
    return () => clearInterval(interval);
  }, [
    searchTerm,
    caseSensitive,
    useRegex,
    searchRef,
    headerHeight,
    open,
    disabled,
  ]);

  // Main function for finding matches (Data Search)
  const refreshSearch = useCallback(
    (scrollTo: ScrollToMatchOption = "none") => {
      // Search History
      const results: SearchMatch[] = [];
      const query = caseSensitive ? searchTerm : searchTerm.toLowerCase();

      if (!query) {
        setMatches([]);
        return;
      }

      history.forEach((item, historyIndex) => {
        if (item.message.role === "system") return;
        const content = item.message.content;
        const textContent =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .map((part) => (part.type === "text" ? part.text : ""))
                  .join("")
              : "";

        const textToCheck = caseSensitive
          ? textContent
          : textContent.toLowerCase();

        let startIndex = 0;
        while ((startIndex = textToCheck.indexOf(query, startIndex)) !== -1) {
          results.push({
            index: results.length,
            messageIndex: historyIndex,
          });
          startIndex += query.length;
        }
      });

      setMatches(results);

      // Find match closest to the middle of the view?
      // With virtual scroll, "middle" is hard.
      // We will just default to the first one or keep current?
      if (searchTerm.length > 1 && results.length) {
        if (scrollTo === "first") {
          scrollToMatch(results[0]);
        }
        // "closest" is hard without DOM. We skip it for now and assume top.
        if (scrollTo === "none") {
          // Keep current if possible?
          if (currentMatch) {
            const matchingResult = results.find(
              (r) => r.messageIndex === currentMatch.messageIndex,
            );
            if (matchingResult) {
              setCurrentMatch(matchingResult);
            } else {
              setCurrentMatch(results[0]);
            }
          } else {
            setCurrentMatch(results[0]);
          }
        }
      }
    },
    [searchTerm, caseSensitive, useRegex, history, scrollToMatch],
  );

  // Triggers that should cause immediate refresh of results to closest search value:
  useEffect(() => {
    if (disabled || !open) {
      setMatches([]);
    } else {
      refreshSearch("first");
    }
  }, [refreshSearch, open, disabled]);

  // Clicks in search div can cause content changes that for some reason don't trigger resize
  // Refresh clicking within container
  useEffect(() => {
    const searchContainer = searchRef.current;
    if (!open || !searchContainer) return;
    const handleSearchRefClick = () => {
      // Just re-run highlights
    };
    searchContainer.addEventListener("click", handleSearchRefClick);
    return () => {
      searchContainer.removeEventListener("click", handleSearchRefClick);
    };
  }, [searchRef, refreshSearch, open]);

  // Find widget component
  const widget = (
    <div
      className={`fixed top-0 z-50 transition-all ${open ? "" : "-translate-y-full"} bg-vsc-background right-0 flex flex-row items-center gap-1.5 rounded-bl-lg border-0 border-b border-l border-solid border-zinc-700 pl-[3px] pr-3 sm:gap-2`}
    >
      <Input
        disabled={disabled}
        type="text"
        ref={inputRef}
        value={currentValue}
        onChange={(e) => {
          setCurrentValue(e.target.value);
        }}
        placeholder="Search..."
      />
      <p className="xs:block hidden min-w-12 whitespace-nowrap px-1 text-center text-xs">
        {matches.length === 0
          ? "No results"
          : `${(currentMatch?.index ?? 0) + 1} of ${matches.length}`}
      </p>
      <div className="hidden flex-row gap-0.5 sm:flex">
        <HeaderButtonWithToolTip
          tooltipPlacement="top-end"
          text={"Previous Match"}
          onClick={(e) => {
            e.stopPropagation();
            previousMatch();
          }}
          className="h-4 w-4 focus:ring"
          disabled={matches.length < 2 || disabled}
        >
          <ArrowUpIcon className="h-4 w-4" />
        </HeaderButtonWithToolTip>
        <HeaderButtonWithToolTip
          tooltipPlacement="top-end"
          text={"Next Match"}
          onClick={(e) => {
            e.stopPropagation();
            nextMatch();
          }}
          className="h-4 w-4 focus:ring"
          disabled={matches.length < 2 || disabled}
        >
          <ArrowDownIcon className="h-4 w-4" />
        </HeaderButtonWithToolTip>
      </div>
      <HeaderButtonWithToolTip
        disabled={disabled}
        inverted={caseSensitive}
        tooltipPlacement="top-end"
        text={
          caseSensitive
            ? "Turn off case sensitivity"
            : "Turn on case sensitivity"
        }
        onClick={(e) => {
          e.stopPropagation();
          setCaseSensitive((curr) => !curr);
        }}
        className="h-5 w-6 rounded-full border text-xs focus:outline-none focus:ring"
      >
        Aa
      </HeaderButtonWithToolTip>
      {/* TODO - add useRegex functionality */}
      <HeaderButton
        inverted={false}
        onClick={() => setOpen(false)}
        className="focus:ring"
      >
        <XMarkIcon className="h-4 w-4" />
      </HeaderButton>
    </div>
  );

  // Generate the highlight overlay elements
  const highlights = useMemo(() => {
    return visibleHighlights.map((match) => (
      <HighlightOverlay
        rectangle={match.overlayRectangle!}
        isCurrent={false} // We don't easily track current *visual* match to *logical* match yet
      />
    ));
  }, [visibleHighlights]);

  return {
    highlights,
    widget,
  };
};
