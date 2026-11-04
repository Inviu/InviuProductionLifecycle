import { useApp } from './context/AppContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { WorkOrderPage } from './pages/WorkOrderPage';
import { OperatorPage } from './pages/OperatorPage';
import { ProductionLogPage } from './pages/ProductionLogPage';
import { AgentPage } from './pages/AgentPage';
import { Loader } from 'lucide-react';

function App() {
  const { currentPage, isAuthenticated, bootstrapping } = useApp();

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  return (
    <>
      {currentPage === 'home' && <HomePage />}
      {currentPage === 'workorder' && <WorkOrderPage />}
      {currentPage === 'operator' && <OperatorPage />}
      {currentPage === 'production' && <ProductionLogPage />}
      {currentPage === 'efficiency' && <AgentPage />}
    </>
  );
}

export default App;
