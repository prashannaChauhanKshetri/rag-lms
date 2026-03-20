const BASE_URL = '/api';

interface RequestOptions extends RequestInit {
    token?: string;
}

class ApiClient {
    public static readonly BASE_URL = 'http://localhost:8000'; // Make this configurable or dynamic if needed

    public getBaseUrl(): string {
        return ApiClient.BASE_URL;
    }

    private getHeaders(token?: string, isFormData: boolean = false): HeadersInit {
        const headers: HeadersInit = {};

        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        // Tokens should be passed explicitly if needed; default auth uses secure cookies.
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

        const isFormData = options.body instanceof FormData;

        const config: RequestInit = {
            ...options,
            headers: {
                ...this.getHeaders(options.token, isFormData),
                ...options.headers,
            },
            credentials: 'include', // Ensure cookies are sent
        };

        try {
            const response = await fetch(url, config);

            if (response.status === 401) {
                // Handle unauthorized (e.g., redirect to login)
                // Only redirect if not already on login page to avoid loops
                if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
                    window.location.href = '/';
                }
                throw new Error('Unauthorized');
            }

            const data = await response.json();

            if (!response.ok) {
                let detailMessage = 'API Request Failed';

                if (typeof data?.detail === 'string') {
                    detailMessage = data.detail;
                } else if (Array.isArray(data?.detail)) {
                    detailMessage = data.detail
                        .map((item: unknown) => {
                            if (typeof item === 'string') return item;
                            if (item && typeof item === 'object' && 'msg' in item) {
                                return String((item as { msg: unknown }).msg);
                            }
                            return JSON.stringify(item);
                        })
                        .join('; ');
                } else if (data?.detail && typeof data.detail === 'object') {
                    detailMessage = JSON.stringify(data.detail);
                }

                const apiError = new Error(detailMessage) as Error & {
                    status?: number;
                    payload?: unknown;
                };
                apiError.status = response.status;
                apiError.payload = data;
                throw apiError;
            }

            return data;
        } catch (error) {
            // Re-throw to be handled by components
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // HTTP Methods using the wrapper
    get<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    }

    post<T>(endpoint: string, body: unknown, options?: RequestOptions) {
        const isFormData = body instanceof FormData;

        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body),
        });
    }

    put<T>(endpoint: string, body: unknown, options?: RequestOptions) {
        const isFormData = body instanceof FormData;

        return this.request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: isFormData ? body : JSON.stringify(body),
        });
    }

    delete<T>(endpoint: string, options?: RequestOptions) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
}

export const api = new ApiClient();
