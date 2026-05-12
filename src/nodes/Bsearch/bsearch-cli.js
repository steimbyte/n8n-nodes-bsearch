#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function getApiKey() {
  try {
    const envFile = join(homedir(), '.bsearch-env');
    const content = readFileSync(envFile, 'utf8');
    const match = content.match(/^BRAVE_API_KEY=(.+)$/m);
    if (match) return match[1];
  } catch (e) {}
  return process.env.BRAVE_API_KEY;
}

const program = new Command();

program
  .name('bsearch')
  .description('Web search using Brave Search API - LLM Context & Web Search')
  .version('1.0.0')
  .argument('<query>', 'search query')
  .option('-c, --count <n>', 'Number of search results to consider (1-50)', '20')
  .option('-f, --freshness <period>', 'Freshness filter (pd/pw/pm/py or YYYY-MM-DDtoYYYY-MM-DD)')
  .option('-o, --offset <n>', 'Pagination offset for web search', '0')
  .option('-s, --safesearch <mode>', 'SafeSearch mode (off/moderate/strict) [web only]', 'off')
  // LLM Context Options
  .option('--max-tokens <n>', 'Max tokens in context (1024-32768)', '8192')
  .option('--max-urls <n>', 'Max URLs in response (1-50)', '20')
  .option('--max-snippets <n>', 'Max snippets total (1-100)', '50')
  .option('--max-tokens-per-url <n>', 'Max tokens per URL (512-8192)', '4096')
  .option('--max-snippets-per-url <n>', 'Max snippets per URL (1-100)', '50')
  .option('--threshold <mode>', 'Context threshold (strict/balanced/lenient/disabled)', 'balanced')
  .option('--goggles <url>', 'Goggles URL or inline definition')
  .option('--local', 'Force local recall for location-aware queries')
  // Location headers
  .option('--lat <float>', 'Latitude (-90 to 90)')
  .option('--long <float>', 'Longitude (-180 to 180)')
  .option('--city <name>', 'City name')
  .option('--state <code>', 'State/region code')
  .option('--country <code>', 'Country code (2 letters)')
  .option('--postal <code>', 'Postal code')
  // Output options
  .option('--web', 'Use classic web search instead of LLM Context')
  .option('--raw', 'Output raw JSON response')
  .option('--compact', 'Compact output (fewer snippets)')
  .option('--timeout <ms>', 'Request timeout in ms (default: 30000)', '30000')
  .option('--llm', 'Use LLM Context mode (default)')
  .option('-m, --mode <mode>', 'Mode: llm or web (env: BSEARCH_MODE)', 'llm')
  .option('--force-llm', 'Force LLM Context even if not in plan (may fail)')
  .addHelpText('after', `
Mode Switching:
  --llm       Use LLM Context mode (pre-extracted content for AI) [default]
  --web       Use classic web search (links + descriptions)
  -m <mode>   Explicit mode: llm or web
  BSEARCH_MODE=llm|web  ENV variable override

Examples:
  bsearch "python"                         # LLM Context (default)
  bsearch "python" --web                   # Classic web search
  BSEARCH_MODE=web bsearch "python"        # ENV override

Tip: Set 'export BSEARCH_MODE=web' in shell for web search default`)
  .action(async (query, options) => {
    try {
      if (options.raw && options.compact) {
        console.error('Error: Cannot use --raw with --compact');
        process.exit(1);
      }
      await performSearch(query, options);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();

async function fetchWithRetry(url, options, retries = 3) {
  const timeout = parseInt(options.timeout) || 30000;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || Math.pow(2, attempt + 1);
        if (attempt < retries) {
          console.error(`Rate limited. Retrying in ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${timeout}ms`);
      }

      if (attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.error(`Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function performSearch(query, options) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('BRAVE_API_KEY not set ( ~/.bsearch-env)');
  }

  // Determine search mode: CLI flag > ENV var > default (llm)
  const mode = options.web ? 'web' : (options.forceLlm ? 'llm' : (process.env.BSEARCH_MODE || options.mode || 'llm'));

  if (mode === 'web') {
    await performWebSearch(query, options, apiKey);
  } else {
    // Try LLM Context first, fallback to web search if not available
    try {
      await performLlmContext(query, options, apiKey);
    } catch (error) {
      if (error.message.includes('not subscribed') || error.message.includes('OPTION_NOT_IN_PLAN')) {
        console.error('⚠️  LLM Context not available in your plan. Falling back to web search...\n');
        await performWebSearch(query, options, apiKey);
      } else {
        throw error;
      }
    }
  }
}

async function performLlmContext(query, options, apiKey, force = false) {
  const apiUrl = new URL('https://api.search.brave.com/res/v1/llm/context');
  apiUrl.searchParams.append('q', query);
  apiUrl.searchParams.append('count', options.count);
  apiUrl.searchParams.append('maximum_number_of_tokens', options.maxTokens);
  apiUrl.searchParams.append('maximum_number_of_urls', options.maxUrls);
  apiUrl.searchParams.append('maximum_number_of_snippets', options.maxSnippets);
  apiUrl.searchParams.append('maximum_number_of_tokens_per_url', options.maxTokensPerUrl);
  apiUrl.searchParams.append('maximum_number_of_snippets_per_url', options.maxSnippetsPerUrl);
  apiUrl.searchParams.append('context_threshold_mode', options.threshold);

  if (options.goggles) apiUrl.searchParams.append('goggles', options.goggles);
  if (options.local) apiUrl.searchParams.append('enable_local', 'true');
  if (options.freshness) apiUrl.searchParams.append('freshness', options.freshness);

  const headers = {
    'X-Subscription-Token': apiKey,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'cache-control': 'no-cache'
  };

  // Add location headers if provided
  if (options.lat) headers['X-Loc-Lat'] = options.lat;
  if (options.long) headers['X-Loc-Long'] = options.long;
  if (options.city) headers['X-Loc-City'] = options.city;
  if (options.state) headers['X-Loc-State'] = options.state;
  if (options.country) headers['X-Loc-Country'] = options.country;
  if (options.postal) headers['X-Loc-Postal-Code'] = options.postal;

  const response = await fetchWithRetry(apiUrl.toString(), { headers }, 3);

  if (!response.ok) {
    // Try to parse error response for detailed message
    try {
      const errorData = await response.json();
      if (errorData.error?.code === 'OPTION_NOT_IN_PLAN') {
        throw new Error('OPTION_NOT_IN_PLAN');
      }
      const detail = errorData.error?.detail || '';
      throw new Error(`${msgs[response.status] || `API error ${response.status}`}${detail ? ': ' + detail : ''}`);
    } catch (e) {
      if (e.message === 'OPTION_NOT_IN_PLAN') throw e;
      throw new Error(msgs[response.status] || `API error ${response.status}`);
    }
  }

  const data = await response.json();

  if (options.raw) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  printLlmContextResults(data, options.compact);
}

const msgs = { 401: 'Invalid API key', 429: 'Rate limited', 500: 'Server error' };

function printLlmContextResults(data, compact = false) {
  const grounding = data.grounding || {};
  const sources = data.sources || {};

  let totalSnippets = 0;

  // POI (Point of Interest)
  if (grounding.poi) {
    const poi = grounding.poi;
    totalSnippets += poi.snippets?.length || 0;
    console.log('\n📍 ' + poi.name);
    console.log('   ' + poi.url);
    if (poi.snippets) {
      poi.snippets.slice(0, compact ? 1 : 3).forEach(s => console.log('   ' + truncate(s, 300)));
    }
    console.log();
  }

  // Map results
  if (grounding.map && grounding.map.length > 0) {
    console.log('\n🗺️  Local Results:');
    grounding.map.slice(0, compact ? 3 : 5).forEach((m, i) => {
      totalSnippets += m.snippets?.length || 0;
      console.log(`\n${i + 1}. ${m.name}`);
      console.log('   ' + m.url);
      if (m.snippets) {
        m.snippets.slice(0, compact ? 1 : 2).forEach(s => console.log('   ' + truncate(s, 200)));
      }
    });
    console.log();
  }

  // Generic results (main grounding data)
  if (grounding.generic && grounding.generic.length > 0) {
    console.log('\n📄 Sources (' + grounding.generic.length + '):\n');

    grounding.generic.forEach((item, i) => {
      const snippetCount = item.snippets?.length || 0;
      totalSnippets += snippetCount;
      const snippetLimit = compact ? 1 : 3;

      console.log(`${i + 1}. ${item.title}`);
      console.log('   ' + item.url);

      if (item.snippets) {
        item.snippets.slice(0, snippetLimit).forEach(s => {
          console.log('   ' + truncate(s, 300));
        });
        if (item.snippets.length > snippetLimit) {
          console.log(`   [+${item.snippets.length - snippetLimit} more snippets]`);
        }
      }
      console.log();
    });
  } else {
    // Handle empty results gracefully
    console.log('\n⚠️  No relevant content found for this query.\n');
  }

  console.log('─'.repeat(60));
  console.log(`Total: ${grounding.generic?.length || 0} sources, ~${totalSnippets} snippets`);

  if (Object.keys(sources).length > 0) {
    console.log('\n📅 Source ages:');
    Object.entries(sources).forEach(([url, meta]) => {
      const age = meta.age ? ` (${meta.age[2] || meta.age[0]})` : '';
      console.log(`   ${meta.hostname}${age}`);
    });
  }
}

async function performWebSearch(query, options, apiKey) {
  const apiUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  apiUrl.searchParams.append('q', query);
  apiUrl.searchParams.append('count', options.count);
  apiUrl.searchParams.append('safesearch', options.safesearch);
  if (options.offset && options.offset !== '0') apiUrl.searchParams.append('offset', options.offset);
  if (options.freshness) apiUrl.searchParams.append('freshness', options.freshness);

  const response = await fetchWithRetry(apiUrl.toString(), {
    headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' }
  }, 3);

  if (!response.ok) {
    const msgs = { 401: 'Invalid API key', 429: 'Rate limited', 500: 'Server error' };
    throw new Error(msgs[response.status] || `API error ${response.status}`);
  }

  const data = await response.json();

  if (options.raw) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const results = data.web?.results || [];

  if (results.length === 0) {
    console.log('No results found');
    return;
  }

  console.log(`[Web Search] Found ${results.length} results for "${query}":\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.title}`);
    console.log(`   ${r.url}`);
    if (r.description) console.log(`   ${truncate(r.description, 250)}`);
    if (r.age) console.log(`   (${r.age})`);
    console.log();
  });

  if (data.web?.total?.results > results.length) {
    console.log(`~${data.web.total.results} total. More: bsearch "${query}" -o ${results.length}`);
  }
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
