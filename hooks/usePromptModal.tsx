"use client";

import React, { useState, useCallback } from 'react';
import PromptModal from '@/components/PromptModal';

interface PromptState {
  isOpen: boolean;
  title: string;
  defaultValue: string;
  resolve: ((value: string | null) => void) | null;
}

export function usePromptModal() {
  const [promptState, setPromptState] = useState<PromptState>({
    isOpen: false,
    title: "",
    defaultValue: "",
    resolve: null,
  });

  const requestPrompt = useCallback((title: string, defaultValue = ""): Promise<string | null> => {
    return new Promise((resolve) => {
      setPromptState({
        isOpen: true,
        title,
        defaultValue,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback((value: string | null) => {
    if (promptState.resolve) {
      promptState.resolve(value);
    }
    setPromptState((prev) => ({ ...prev, isOpen: false }));
  }, [promptState]);

  const PromptComponent = (
    <PromptModal
      isOpen={promptState.isOpen}
      title={promptState.title}
      defaultValue={promptState.defaultValue}
      onClose={() => handleClose(null)}
      onSubmit={(val) => handleClose(val)}
    />
  );

  return { requestPrompt, PromptComponent };
}
