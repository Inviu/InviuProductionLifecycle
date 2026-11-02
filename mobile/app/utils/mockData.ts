import { Machine, Process, Product } from '@/types';

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Spindle75',
    description: 'High-speed spindle for precision work',
  },
  {
    id: '2',
    name: 'Spindle120',
    description: 'Heavy-duty spindle for industrial applications',
  },
  {
    id: '3',
    name: 'Spindle200',
    description: 'Ultra-precision spindle',
  },
];

export const mockProcesses: Record<string, Process[]> = {
  '1': [
    { id: 'p1', productId: '1', name: 'Cutting', description: 'Initial cutting process' },
    { id: 'p2', productId: '1', name: 'Drilling', description: 'Precision drilling' },
    { id: 'p3', productId: '1', name: 'Polishing', description: 'Final polishing' },
  ],
  '2': [
    { id: 'p4', productId: '2', name: 'Cutting', description: 'Initial cutting process' },
    { id: 'p5', productId: '2', name: 'Drilling', description: 'Heavy-duty drilling' },
    { id: 'p6', productId: '2', name: 'Assembly', description: 'Component assembly' },
    { id: 'p7', productId: '2', name: 'Testing', description: 'Quality testing' },
  ],
  '3': [
    { id: 'p8', productId: '3', name: 'Precision Cutting', description: 'Ultra-precision cutting' },
    { id: 'p9', productId: '3', name: 'Fine Drilling', description: 'Fine drilling process' },
    { id: 'p10', productId: '3', name: 'Finishing', description: 'Final finishing' },
  ],
};

export const mockMachines: Record<string, Machine[]> = {
  'p1': [
    { id: 'm1', processId: 'p1', name: 'Machine 1', description: 'Cutting machine A' },
    { id: 'm2', processId: 'p1', name: 'Machine 2', description: 'Cutting machine B' },
  ],
  'p2': [
    { id: 'm3', processId: 'p2', name: 'Machine 1', description: 'Drilling machine A' },
    { id: 'm4', processId: 'p2', name: 'Machine 2', description: 'Drilling machine B' },
    { id: 'm5', processId: 'p2', name: 'Machine 3', description: 'Drilling machine C' },
  ],
  'p3': [
    { id: 'm6', processId: 'p3', name: 'Machine 1', description: 'Polishing machine' },
  ],
  'p4': [
    { id: 'm7', processId: 'p4', name: 'Machine 1', description: 'Heavy-duty cutter A' },
    { id: 'm8', processId: 'p4', name: 'Machine 2', description: 'Heavy-duty cutter B' },
  ],
  'p5': [
    { id: 'm9', processId: 'p5', name: 'Machine 1', description: 'Industrial drill A' },
    { id: 'm10', processId: 'p5', name: 'Machine 2', description: 'Industrial drill B' },
  ],
  'p6': [
    { id: 'm11', processId: 'p6', name: 'Assembly Line 1', description: 'Main assembly line' },
  ],
  'p7': [
    { id: 'm12', processId: 'p7', name: 'Test Bench 1', description: 'Quality testing station' },
  ],
  'p8': [
    { id: 'm13', processId: 'p8', name: 'Precision Cutter', description: 'Ultra-precision cutting' },
  ],
  'p9': [
    { id: 'm14', processId: 'p9', name: 'Fine Drill', description: 'Ultra-fine drilling' },
  ],
  'p10': [
    { id: 'm15', processId: 'p10', name: 'Finishing Station', description: 'Final finishing' },
  ],
};
