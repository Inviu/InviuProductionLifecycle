# INVUI - Production Tracking System

A mobile app designed for small-scale manufacturing units to track daily production efficiently.

## App Workflow

```
Admin Login → Product Selection → Process Selection → Machine Selection → Production Entry → Submit → Back to Machine List
```

## Screen Structure

### 1. **Login Screen** (`app/(auth)/login.tsx`)
- Default admin credentials: `admin` / `admin`
- Simple form-based authentication
- Navigates to Product Selection on successful login

### 2. **Product Selection Screen** (`app/(main)/index.tsx`)
- Displays available products (Spindle75, Spindle120, Spindle200, etc.)
- Users select a product to proceed
- Logout button available in the header
- Each product has multiple associated processes

### 3. **Process Selection Screen** (`app/(main)/process.tsx`)
- Shows all processes for the selected product
- Examples: Cutting, Drilling, Polishing, Assembly, Testing
- Users select a process to view available machines
- Back button to return to product selection

### 4. **Machine Selection Screen** (`app/(main)/machine.tsx`)
- Displays all machines for the selected process
- Examples: Machine 1, Machine 2, etc.
- Users select a machine to enter production details
- Back button to return to process selection

### 5. **Production Entry Screen** (`app/(main)/production.tsx`)
- Form to enter production details:
  - Worker Name
  - Start Time (time picker)
  - End Time (time picker)
  - Units Produced
- Submit button saves the entry and returns to Machine Selection
- Cancel button discards entry and returns to Machine Selection
- Displays current selection context (Product, Process, Machine)

## Project Structure

```
invui_app/
├── app/
│   ├── (auth)/                 # Authentication screens
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   ├── (main)/                 # Main app screens
│   │   ├── _layout.tsx
│   │   ├── index.tsx           # Product selection
│   │   ├── process.tsx         # Process selection
│   │   ├── machine.tsx         # Machine selection
│   │   └── production.tsx      # Production entry
│   ├── _layout.tsx             # Root layout with auth/main routing
│   ├── modal.tsx               # (existing)
│   └── (tabs)/                 # (existing tabs structure - not used in INVUI)
├── components/                 # Reusable UI components
│   ├── Button.tsx              # Custom button component
│   ├── ListItem.tsx            # List item with icon and chevron
│   ├── TextInputField.tsx      # Form input field
│   ├── TimePicker.tsx          # Time selection picker
│   ├── external-link.tsx       # (existing)
│   ├── haptic-tab.tsx          # (existing)
│   ├── hello-wave.tsx          # (existing)
│   ├── parallax-scroll-view.tsx # (existing)
│   ├── themed-text.tsx         # (existing)
│   ├── themed-view.tsx         # (existing)
│   └── ui/
│       ├── collapsible.tsx
│       ├── icon-symbol.ios.tsx
│       └── icon-symbol.tsx
├── context/                    # State management
│   ├── AuthContext.tsx         # Authentication state
│   └── AppContext.tsx          # App state (selected product/process/machine, entries)
├── types/
│   └── index.ts                # TypeScript type definitions
├── utils/
│   └── mockData.ts             # Mock data for products, processes, machines
├── hooks/                      # (existing custom hooks)
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
├── constants/                  # (existing)
│   └── theme.ts
├── assets/                     # (existing)
│   └── images/
├── app.json                    # Expo app configuration
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript configuration
├── eslint.config.js            # ESLint configuration
└── README.md
```

## Key Features

### State Management
- **AuthContext**: Handles login/logout and user authentication state
- **AppContext**: Manages selected product, process, machine, and production entries

### Reusable Components
- **Button**: Primary, secondary, and danger variants
- **ListItem**: Displays items with icons and descriptions
- **TextInputField**: Form input with labels
- **TimePicker**: Custom time selection component with hour and minute scrollers

### Mock Data
The app includes mock data for:
- 3 Products (Spindle75, Spindle120, Spindle200)
- 3-4 Processes per product
- 1-2 Machines per process
- All data is stored in `utils/mockData.ts`

### Navigation Flow
- Expo Router handles file-based routing
- Conditional rendering in root layout based on authentication state
- Back buttons available at each step to navigate backward

## Types

```typescript
interface Product {
  id: string;
  name: string;
  description?: string;
}

interface Process {
  id: string;
  productId: string;
  name: string;
  description?: string;
}

interface Machine {
  id: string;
  processId: string;
  name: string;
  description?: string;
}

interface ProductionEntry {
  id: string;
  machineId: string;
  workerName: string;
  startTime: string;
  endTime: string;
  unitsProduced: number;
  timestamp: string;
}
```

## Running the App

### Start Development Server
```bash
npm start
```

### Available Commands
- Press `a` to open on Android
- Press `w` to open on web
- Press `i` to open on iOS (macOS only)
- Press `r` to reload the app
- Press `m` to toggle menu
- Press `Ctrl+C` to exit

## Default Credentials
- **Username**: admin
- **Password**: admin

## Styling
- Modern, clean UI with Material Design principles
- Primary color: `#0066CC` (blue)
- Secondary color: `#E8E8E8` (light gray)
- Danger color: `#FF3B30` (red)
- Responsive design for all screen sizes

## Future Enhancements
- Backend integration for data persistence
- Real database instead of mock data
- User role management (Admin, Worker, Manager)
- Production data analytics and reports
- Offline support with local storage
- Photo/camera integration for production verification
- Real-time syncing across multiple devices
