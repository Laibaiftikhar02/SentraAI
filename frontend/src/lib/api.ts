const API_BASE = "/api/v1";

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("sentraai_token");
  }

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, headers: customHeaders, ...rest } = options;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(customHeaders as Record<string, string>),
    };

    if (auth) {
      const token = this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      headers,
      ...rest,
    });

    if (response.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("sentraai_token");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Request failed");
    }

    return response.json();
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
