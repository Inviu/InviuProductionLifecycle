const BASE_URL = 'https://invuie-api.onrender.com/api/getAllProducts';

export const productsAPI = {
    fetchAllProducts: async () => {
        try {
            const response = await fetch(BASE_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            console.error("Error fetching products:", error);
            throw error;
        }       
    }
};

