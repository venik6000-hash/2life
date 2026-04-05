import { useMemo, useState } from "react";

// Template hook for new sections:
// - keep section-local state here
// - expose only data/actions needed by JSX
export function useSectionState({ stage, updateStage, todayLabel }) {
  const [isEditMode, setIsEditMode] = useState(false);

  const sectionItems = useMemo(() => stage?.items || [], [stage?.items]);

  const addItem = () => {
    updateStage((s) => {
      if (!Array.isArray(s.items)) s.items = [];
      s.items.push({ title: "Новый элемент", createdAt: todayLabel() });
    });
  };

  const updateItemTitle = (index, nextTitle) => {
    updateStage((s) => {
      if (!Array.isArray(s.items) || !s.items[index]) return;
      s.items[index].title = String(nextTitle || "");
    });
  };

  return {
    isEditMode,
    setIsEditMode,
    sectionItems,
    addItem,
    updateItemTitle,
  };
}
