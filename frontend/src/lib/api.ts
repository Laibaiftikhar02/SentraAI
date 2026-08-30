const API_BASE = "/api/v1";

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

// Guard flag to prevent multiple concurrent 401 redirects
let isRedirectingTo401 = false;

// Helper: extract meaningful error detail from a backend response
async function extractErrorDetail(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    // FastAPI 422 validation: detail is an array of { loc, msg, type }
    if (Array.isArray(body.detail)) {
      const msgs = body.detail
        .map((e: { msg?: string }) => e.msg)
        .filter(Boolean);
      if (msgs.length > 0) return msgs.join("; ");
    }
    if (typeof body.message === "string") return body.message;
  } catch {
    // response body is not JSON — fall through
  }
  return fallback;
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

    // Save the token used for this request so we can detect replacements
    let requestToken: string | null = null;
    if (auth) {
      requestToken = this.getToken();
      if (requestToken) {
        headers["Authorization"] = `Bearer ${requestToken}`;
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      headers,
      ...rest,
    });

    if (response.status === 401) {
      // Only auto-redirect if:
      //  1. This request actually carried a token (real session expiry)
      //  2. No other request is already handling the redirect
      //  3. The token has NOT been replaced by a fresh login while
      //     this request was in flight
      if (requestToken && typeof window !== "undefined" && !isRedirectingTo401) {
        const currentToken = localStorage.getItem("sentraai_token");
        if (currentToken === requestToken) {
          isRedirectingTo401 = true;
          localStorage.removeItem("sentraai_token");
          window.location.href = "/session-expired";
          // Reset guard after navigation has time to fire
          setTimeout(() => {
            isRedirectingTo401 = false;
          }, 3000);
        }
        // else: token was replaced by a fresh login — do NOT redirect
      }
      const detail = await extractErrorDetail(response, "Unauthorized");
      throw new Error(detail);
    }

    if (response.status === 403) {
      const detail = await extractErrorDetail(response, "Forbidden");
      throw new Error(detail);
    }

    if (response.status === 404) {
      const detail = await extractErrorDetail(response, "Not Found");
      throw new Error(detail);
    }

    if (response.status >= 500) {
      const detail = await extractErrorDetail(response, "Server Error");
      throw new Error(detail);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Request failed");
    }

    // 204 No Content — return undefined instead of parsing empty JSON
    if (response.status === 204) {
      return undefined as T;
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
