import { AppState, Machine, Process, Product, ProductionEntry } from '@/types';
import React, { createContext, useCallback, useContext, useState } from 'react';

interface AppContextType {
  appState: AppState;
  setSelectedProduct: (product: Product) => void;
  setSelectedProcess: (process: Process) => void;
  setSelectedMachine: (machine: Machine) => void;
  addProductionEntry: (entry: ProductionEntry) => void;
  resetSelection: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [appState, setAppState] = useState<AppState>({
    entries: [],
  });

  const setSelectedProduct = useCallback((product: Product) => {
    setAppState((prev) => ({
      ...prev,
      selectedProduct: product,
      selectedProcess: undefined,
      selectedMachine: undefined,
    }));
  }, []);

  const setSelectedProcess = useCallback((process: Process) => {
    setAppState((prev) => ({
      ...prev,
      selectedProcess: process,
      selectedMachine: undefined,
    }));
  }, []);

  const setSelectedMachine = useCallback((machine: Machine) => {
    setAppState((prev) => ({
      ...prev,
      selectedMachine: machine,
    }));
  }, []);

  const addProductionEntry = useCallback((entry: ProductionEntry) => {
    setAppState((prev) => ({
      ...prev,
      entries: [...prev.entries, entry],
    }));
  }, []);

  const resetSelection = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      selectedProcess: undefined,
      selectedMachine: undefined,
    }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        appState,
        setSelectedProduct,
        setSelectedProcess,
        setSelectedMachine,
        addProductionEntry,
        resetSelection,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
