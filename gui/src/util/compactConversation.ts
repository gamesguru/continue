import { useContext } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import {
  deleteCompaction,
  setCompactionLoading,
} from "../redux/slices/sessionSlice";
import { calculateContextPercentage } from "../redux/thunks/calculateContextPercentage";
import { loadSession, saveCurrentSession } from "../redux/thunks/session";

export const useCompactConversation = () => {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const currentSessionId = useAppSelector((state) => state.session.id);

  return async (index: number) => {
    if (!currentSessionId) {
      return;
    }

    try {
      // Set loading state
      dispatch(setCompactionLoading({ index, loading: true }));

      // Save the session first to ensure the core has the latest history
      await dispatch(
        saveCurrentSession({
          openNewSession: false,
          generateTitle: false,
        }),
      );

      await ideMessenger.request("conversation/compact", {
        index,
        sessionId: currentSessionId,
      });

      // Reload the current session to refresh the conversation state
      const loadSessionResult = await dispatch(
        loadSession({
          sessionId: currentSessionId,
          saveCurrentSession: false,
        }),
      );

      // Calculate context percentage for the newly loaded session
      if (loadSessionResult.meta.requestStatus === "fulfilled") {
        dispatch(calculateContextPercentage());
      }
    } catch (error) {
      console.error("Error compacting conversation:", error);
    } finally {
      // Clear loading state
      dispatch(setCompactionLoading({ index, loading: false }));
    }
  };
};

export const useDeleteCompaction = () => {
  const dispatch = useAppDispatch();

  return (index: number) => {
    // Update local state and save to persistence
    dispatch(deleteCompaction(index));
    dispatch(
      saveCurrentSession({
        openNewSession: false,
        generateTitle: false,
      }),
    );
  };
};
