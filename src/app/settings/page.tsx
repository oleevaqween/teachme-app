"use client";

import { useState, useEffect } from "react";
import { Settings, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ProviderType } from "@/lib/llm/provider";
import { ProviderConfig } from "@/components/settings/ProviderConfig";
import { BackupCard } from "@/components/backup/BackupCard";
import { RestoreCard } from "@/components/backup/RestoreCard";
import { cn } from "@/lib/utils";

interface ProviderOption {
  type: ProviderType;
  name: string;
  description: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    type: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4, and other OpenAI models via API key.",
  },
  {
    type: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Haiku, and Opus models via API key.",
  },
  {
    type: "ollama-cloud",
    name: "Ollama Cloud",
    description:
      "Run larger models on datacenter hardware via Ollama's hosted service.",
  },
  {
    type: "ollama-local",
    name: "Ollama Local",
    description:
      "Run models locally on your own hardware. No API key needed.",
  },
];

interface ConfiguredProvider {
  id: string;
  type: ProviderType;
  hasApiKey: boolean;
  baseUrl: string | null;
  model: string;
  isActive: boolean;
}

export default function SettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState<ProviderType | null>(
    null
  );
  const [configuredProviders, setConfiguredProviders] = useState<
    ConfiguredProvider[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [hasAnyProvider, setHasAnyProvider] = useState(false);

  const fetchProviders = async () => {
    try {
      const response = await fetch("/api/settings/provider");
      const data = await response.json();
      if (response.ok && data.providers) {
        setConfiguredProviders(data.providers);
        setHasAnyProvider(data.providers.length > 0);
      }
    } catch {
      // Silently handle — user will see empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // State changes happen after the asynchronous request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProviders();
  }, []);

  const getExistingConfig = (type: ProviderType) => {
    return configuredProviders.find((p) => p.type === type) || null;
  };

  const isActive = (type: ProviderType) => {
    return configuredProviders.some((p) => p.type === type && p.isActive);
  };

  const isConfigured = (type: ProviderType) => {
    return configuredProviders.some((p) => p.type === type);
  };

  const handleSaved = () => {
    fetchProviders();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-(--space-page-inline) py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-h2 sm:text-h1 text-foreground">
              LLM Provider Settings
            </h1>
            <p className="text-small text-foreground-secondary">
              Configure which AI provider powers content generation.
            </p>
          </div>
        </div>
      </div>

      {/* Unconfigured prompt */}
      {!loading && !hasAnyProvider && (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg border border-primary/40 bg-accent px-4 py-3 text-small text-accent-foreground"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">No provider configured</p>
            <p className="mt-1">
              Select and configure an LLM provider below to enable content
              generation features like learning journeys and interview prep.
            </p>
          </div>
        </div>
      )}

      {/* Provider selection cards */}
      <div className="space-y-3">
        <h2 className="text-small font-medium text-muted-foreground">
          Choose a provider
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDER_OPTIONS.map((provider) => {
            const active = isActive(provider.type);
            const configured = isConfigured(provider.type);
            const selected = selectedProvider === provider.type;

            return (
              <button
                key={provider.type}
                type="button"
                onClick={() =>
                  setSelectedProvider(
                    selected ? null : provider.type
                  )
                }
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all",
                  "hover:border-primary/30 hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : active
                      ? "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30"
                      : "border-border bg-card"
                )}
                aria-pressed={selected}
                aria-label={`${provider.name}${active ? " (active)" : configured ? " (configured)" : ""}`}
              >
                {/* Status badge */}
                {active && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-caption font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Active
                  </span>
                )}
                {configured && !active && (
                  <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                    Configured
                  </span>
                )}

                <h3 className="text-lead leading-snug text-foreground">
                  {provider.name}
                </h3>
                <p className="text-small text-foreground-secondary leading-relaxed">
                  {provider.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration form */}
      {selectedProvider && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lead leading-snug text-foreground">
            Configure{" "}
            {PROVIDER_OPTIONS.find((p) => p.type === selectedProvider)?.name}
          </h2>
          <ProviderConfig
            key={`${selectedProvider}:${getExistingConfig(selectedProvider)?.id ?? "new"}:${getExistingConfig(selectedProvider)?.model ?? ""}`}
            providerType={selectedProvider}
            existingConfig={getExistingConfig(selectedProvider)}
            onSaved={handleSaved}
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-8 flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-small text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            Loading provider settings...
          </div>
        </div>
      )}

      <BackupCard />
      <RestoreCard />
    </div>
  );
}
