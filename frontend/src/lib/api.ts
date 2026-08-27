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
    const isFormData = rest.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
        window.location.href = "/session-expired";
      }
      throw new Error("Unauthorized");
    }

    if (response.status === 403) {
      throw new Error("Forbidden");
    }

    if (response.status === 404) {
      throw new Error("Not Found");
    }

    if (response.status >= 500) {
      throw new Error("Server Error");
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

  postForm<T>(path: string, formData: FormData) {
    return this.request<T>(path, {
      method: "POST",
      body: formData,
    });
  }
}

export const api = new ApiClient();
