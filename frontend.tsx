import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./frontend.css";

interface FeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  author?: string;
}

interface Preview {
  title: string;
  description: string;
  link: string;
  items: FeedItem[];
}

interface GenerateResult {
  feedId: string;
  feedUrl: string;
  preview: Preview;
  parserConfig: object;
}

type AppState =
  | { step: "idle" }
  | { step: "loading"; url: string }
  | { step: "preview"; data: GenerateResult }
  | { step: "error"; message: string };

function App() {
  const [state, setState] = useState<AppState>({ step: "idle" });
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setState({ step: "loading", url });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = (await res.json()) as GenerateResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setState({ step: "preview", data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setState({ step: "error", message });
    }
  }

  function handleCopy(feedUrl: string) {
    const fullUrl = `${window.location.origin}${feedUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setState({ step: "idle" });
    setUrl("");
    setCopied(false);
  }

  return (
    <>
      <header>
        <h1>RSS-O-Matic</h1>
        <p>Generate an RSS feed from any website using AI</p>
      </header>

      {(state.step === "idle" || state.step === "loading") && (
        <form className="url-form" onSubmit={handleSubmit}>
          <input
            type="url"
            placeholder="https://example.com/blog"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={state.step === "loading"}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={state.step === "loading"}
          >
            {state.step === "loading" ? "Generating..." : "Generate Feed"}
          </button>
        </form>
      )}

      {state.step === "loading" && (
        <div className="loading">
          <div className="spinner" />
          <p>Fetching page and analyzing structure...</p>
          <p style={{ fontSize: "0.8rem", color: "#555", marginTop: "0.5rem" }}>
            This may take 10-30 seconds
          </p>
        </div>
      )}

      {state.step === "preview" && (
        <div>
          <div className="feed-url-box">
            <code>{window.location.origin}{state.data.feedUrl}</code>
            <button
              className="btn btn-secondary"
              onClick={() => handleCopy(state.data.feedUrl)}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <p className="section-label">
            Preview ({state.data.preview.items.length} items from "{state.data.preview.title}")
          </p>
          <ul className="items-list">
            {state.data.preview.items.slice(0, 10).map((item, i) => (
              <li key={i}>
                <h3>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
                {(item.pubDate || item.author) && (
                  <div className="meta">
                    {item.pubDate && <span>{item.pubDate}</span>}
                    {item.pubDate && item.author && <span> &middot; </span>}
                    {item.author && <span>{item.author}</span>}
                  </div>
                )}
                {item.description && (
                  <div className="desc">
                    {item.description.length > 200
                      ? item.description.slice(0, 200) + "..."
                      : item.description}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <details className="config-toggle">
            <summary>View parser config (JSON)</summary>
            <pre>{JSON.stringify(state.data.parserConfig, null, 2)}</pre>
          </details>

          <div className="actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Generate Another Feed
            </button>
          </div>
        </div>
      )}

      {state.step === "error" && (
        <div className="error-box">
          <p>{state.message}</p>
          <button className="btn btn-primary" onClick={handleReset}>
            Try Again
          </button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
