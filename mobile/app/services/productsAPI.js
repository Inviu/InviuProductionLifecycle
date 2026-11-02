// Kept for backwards compatibility. New code should import { api } from './api'.
import { api } from "./api";

export const productsAPI = {
  fetchAllProducts: () => api.products.list(),
};

export default productsAPI;
