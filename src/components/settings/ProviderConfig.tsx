"use client";

import { useState, useCallback } from "react";
import type { ProviderType } from "@/lib/llm/provider";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";

interface ProviderConfigProps {
  providerType: ProviderType;
  existingConfig?: {
    id: string;
    hasApiKey: boolean;
    baseUrl: string | null;
    model: string;
    isActive: boolean;
  } | null;
  onSaved: () => void;
}

type ValidationState = "idle" | "validating" | "success" | "error";

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: "",
  anthropic: "",
  "ollama-cloud": "https://ollama.com/v1",
  "ollama-local": "http://localhost:11434/v1",
};

export function ProviderConfig({
  providerType,
  existingConfig,
  onSaved,
}: ProviderConfigProps) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    existingConfig?.baseUrl || DEFAULT_BASE_URLS[providerType] || ""
  );
  const [model, setModel] = useState(existingConfig?.model || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationState, setValidationState] =
    useState<ValidationState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const requiresApiKey = providerType !== "ollama-local";

  const fetchModels = useCallback(async () => {
    if (requiresApiKey && providerType !== 'ollama-cloud' && !apiKey && !existingConfig?.hasApiKey) {
      setModelsError("Enter an API key first to fetch available models.");
      return;
    }

    setLoadingModels(true);
    setModelsError("");

    try {
      const response = await fetch(
        '/api/settings/provider/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: providerType, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setModelsError(data.error || "Failed to fetch models.");
        setAvailableModels([]);
        return;
      }

      setAvailableModels(data.models || []);
      if (data.models?.length > 0 && !model) {
        setModel(data.models[0]);
      }
    } catch {
      setModelsError(
        "Could not connect to provider. Check your settings and try again."
      );
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [providerType, apiKey, baseUrl, requiresApiKey, existingConfig, model]);

  const handleValidateAndSave = async () => {
    // Validation checks
    if (requiresApiKey && !apiKey && !existingConfig?.hasApiKey) {
      setErrorMessage("API key is required for this provider.");
      setValidationState("error");
      return;
    }

    if (!model) {
      setErrorMessage("Please select a model.");
      setValidationState("error");
      return;
    }

    setValidationState("validating");
    setErrorMessage("");

    try {
      const body: Record<string, string | undefined> = {
        type: providerType,
        model,
      };

      if (apiKey) body.apiKey = apiKey;
      if (baseUrl) body.baseUrl = baseUrl;

      const response = await fetch("/api/settings/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setValidationState("error");
        setErrorMessage(
          data.error || "Validation failed. Check your credentials."
        );
        return;
      }

      setValidationState("success");
      onSaved();
    } catch {
      setValidationState("error");
      setErrorMessage(
        "Could not reach the server. Please check your connection."
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* API Key input (not shown for ollama-local) */}
      {requiresApiKey && (
        <div className="space-y-2">
          <label
            htmlFor="api-key"
            className="block text-small font-medium text-foreground"
          >
            API Key
          </label>
          <div className="relative">
            <input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationState("idle");
              }}
              placeholder={
                existingConfig?.hasApiKey
                  ? "••••••••••••••••••••••••"
                  : "Enter your API key"
              }
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-body text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {existingConfig?.hasApiKey && (
            <p className="text-small text-muted-foreground">
              A key is already configured. Enter a new one to replace it.
            </p>
          )}
        </div>
      )}

      {/* Base URL (optional for cloud, default for local) */}
      <div className="space-y-2">
        <label
          htmlFor="base-url"
          className="block text-small font-medium text-foreground"
        >
          Base URL{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="base-url"
          type="url"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setValidationState("idle");
          }}
          placeholder={
            DEFAULT_BASE_URLS[providerType] || "https://api.example.com/v1"
          }
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        {providerType === "ollama-local" && (
          <p className="text-small text-muted-foreground">
            Default: http://localhost:11434/v1. Change if your Ollama instance
            runs on a different port.
          </p>
        )}
      </div>

      {/* Model selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="model-select"
            className="block text-small font-medium text-foreground"
          >
            Model
          </label>
          <button
            type="button"
            onClick={fetchModels}
            disabled={loadingModels}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-small font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            aria-label="Refresh available models"
          >
            <RefreshCw
              className={cn("size-3", loadingModels && "animate-spin")}
              aria-hidden="true"
            />
            {loadingModels ? "Loading..." : "Fetch models"}
          </button>
        </div>

        {availableModels.length > 0 ? (
          <select
            id="model-select"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setValidationState("idle");
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">Select a model</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="model-select"
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setValidationState("idle");
            }}
            placeholder="e.g. gpt-4o, claude-sonnet-4-20250514, llama3"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        )}

        {modelsError && (
          <p className="text-small text-destructive">{modelsError}</p>
        )}
      </div>

      {/* Validate & Save button */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleValidateAndSave}
          disabled={validationState === "validating"}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-small font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          {validationState === "validating" && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {validationState === "validating"
            ? "Validating..."
            : "Validate & Save"}
        </button>

        {/* Validation feedback */}
        {validationState === "success" && (
          <div
            className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-small text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2
              className="size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Provider configured successfully. This is now your active
              provider.
            </span>
          </div>
        )}

        {validationState === "error" && (
          <div
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-small text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle
              className="size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
