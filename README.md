# n8n-nodes-bsearch

Brave Search API node for n8n - Web search and LLM Context support.

## Features

- **Web Search** - Classic web search with titles, URLs, and descriptions
- **LLM Context** - AI-optimized search results with pre-extracted content snippets
- **Location Support** - Filter results by latitude/longitude, city, or country
- **Configurable Parameters** - Result count, max tokens, snippets, and more

## Installation

In n8n:
1. Go to **Settings** → **Community Nodes**
2. Click **Install**
3. Enter: `n8n-nodes-bsearch`

Or via CLI:
```bash
npm install n8n-nodes-bsearch
```

## Setup

### Create Credentials

1. Get your Brave Search API key from [brave.com/search/api](https://brave.com/search/api/)
2. In n8n, go to **Credentials** → **New** → **Brave Search API**
3. Enter your API key

### Using the Node

1. Add the **Brave Search** node to your workflow
2. Select or create your **Brave Search API** credentials
3. Choose **Search Mode**:
   - **LLM Context** - Pre-extracted content optimized for AI (default)
   - **Web Search** - Classic search results
4. Enter your **Query**
5. Configure additional options as needed

## Search Modes

### LLM Context (Default)
Returns structured data with:
- Source titles and URLs
- Snippets extracted from pages
- POI (Point of Interest) data for local queries
- Map results for location-based searches

### Web Search
Returns classic search results:
- Titles and URLs
- Descriptions
- Page ages
- Total result count

## Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Query | Search query string | - |
| Search Mode | llm or web | llm |
| Result Count | Number of results (1-50) | 20 |
| Max Tokens | Max tokens in context (LLM mode) | 8192 |
| Max URLs | Max URLs in response (LLM mode) | 20 |
| Max Snippets | Max snippets total (LLM mode) | 50 |
| Context Threshold | strict/balanced/lenient/disabled | balanced |
| Safe Search | off/moderate/strict (web mode) | off |

## Location Options

- **Latitude/Longitude** - Exact coordinates
- **City** - City name
- **Country** - 2-letter country code (e.g., DE, US)

## License

MIT
