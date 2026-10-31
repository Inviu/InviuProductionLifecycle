import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setToken, getToken, setUnauthorizedHandler } from "../services/api";

const AppContext = createContext(undefined);

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [currentPage, setCurrentPage] = useState("login");
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState(null);

  const isAuthenticated = !!user;

  const doLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setWorkOrders([]);
    setCurrentPage("login");
    setCurrentOrderId(null);
  }, []);

  // Log out automatically if the server rejects our token.
  useEffect(() => {
    setUnauthorizedHandler(doLogout);
  }, [doLogout]);

  // On load, if we have a stored token, restore the session.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    api.auth
      .me()
      .then((u) => {
        setUser(u);
        setCurrentPage(u.role === "operator" ? "operator" : "home");
      })
      .catch(() => setToken(null))
      .finally(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentPage === "home") loadWorkOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentPage]);

  const loadWorkOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      setWorkOrders(await api.workOrders.getAll());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    setError(null);
    const { token, user: u } = await api.auth.login(username, password);
    setToken(token);
    setUser(u);
    setCurrentPage(u.role === "operator" ? "operator" : "home");
    return u;
  };

  const getWorkOrderById = async (orderId) => {
    setError(null);
    return api.workOrders.getById(orderId);
  };

  const createWorkOrder = async (payload) => {
    const created = await api.workOrders.create(payload);
    setWorkOrders((prev) => [...prev, created]);
    return created;
  };

  const navigateTo = (page, orderId) => {
    setCurrentPage(page);
    setCurrentOrderId(orderId || null);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        role: user?.role,
        isAuthenticated,
        bootstrapping,
        login,
        logout: doLogout,
        workOrders,
        loadWorkOrders,
        getWorkOrderById,
        createWorkOrder,
        currentPage,
        navigateTo,
        currentOrderId,
        loading,
        error,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
