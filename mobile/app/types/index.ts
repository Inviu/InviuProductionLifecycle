export interface Product {
  id: string;
  name: string;
  description?: string;
}

export interface Process {
  id: string;
  productId: string;
  name: string;
  description?: string;
}

export interface Machine {
  id: string;
  processId: string;
  name: string;
  description?: string;
}

export interface ProductionEntry {
  id: string;
  machineId: string;
  workerName: string;
  startTime: string;
  endTime: string;
  unitsProduced: number;
  reasons?: string[];
  timestamp: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user?: {
    // Real backend roles: 'manager' | 'operator' (kept as string for flexibility).
    role: string;
    name: string;
  };
}

export interface AppState {
  selectedProduct?: Product;
  selectedProcess?: Process;
  selectedMachine?: Machine;
  entries: ProductionEntry[];
}
