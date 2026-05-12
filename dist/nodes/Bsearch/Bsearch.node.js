"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bsearch = void 0;
// Helper functions outside class
async function performWebSearch(query, apiKey, count, safesearch, freshness, offset) {
    var _a, _b, _c;
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', count.toString());
    url.searchParams.append('safesearch', safesearch);
    if (freshness)
        url.searchParams.append('freshness', freshness);
    if (offset > 0)
        url.searchParams.append('offset', offset.toString());
    const response = await fetch(url.toString(), {
        headers: {
            'X-Subscription-Token': apiKey,
            'Accept': 'application/json',
        },
    });
    if (!response.ok) {
        const msgs = { 401: 'Invalid API key', 429: 'Rate limited', 500: 'Server error' };
        throw new Error(msgs[response.status] || `API error ${response.status}`);
    }
    const data = await response.json();
    const results = ((_a = data.web) === null || _a === void 0 ? void 0 : _a.results) || [];
    return {
        query,
        totalResults: ((_c = (_b = data.web) === null || _b === void 0 ? void 0 : _b.total) === null || _c === void 0 ? void 0 : _c.results) || results.length,
        results: results.map((r) => ({
            title: r.title,
            url: r.url,
            description: r.description,
            age: r.age,
        })),
        raw: data,
    };
}
async function performLlmContext(query, apiKey, count, maxTokens, maxUrls, maxSnippets, threshold, location) {
    var _a;
    const url = new URL('https://api.search.brave.com/res/v1/llm/context');
    url.searchParams.append('q', query);
    url.searchParams.append('count', count.toString());
    url.searchParams.append('maximum_number_of_tokens', maxTokens.toString());
    url.searchParams.append('maximum_number_of_urls', maxUrls.toString());
    url.searchParams.append('maximum_number_of_snippets', maxSnippets.toString());
    url.searchParams.append('context_threshold_mode', threshold);
    const headers = {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
        'cache-control': 'no-cache',
    };
    // Add location headers if provided
    if (location.lat)
        headers['X-Loc-Lat'] = location.lat.toString();
    if (location.long)
        headers['X-Loc-Long'] = location.long.toString();
    if (location.city)
        headers['X-Loc-City'] = location.city;
    if (location.country)
        headers['X-Loc-Country'] = location.country;
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
        if (response.status === 401)
            throw new Error('Invalid API key');
        if (response.status === 429)
            throw new Error('Rate limited');
        if (response.status === 403 || response.status === 400) {
            const errorText = await response.text();
            if (errorText.includes('OPTION_NOT_IN_PLAN') || errorText.includes('not subscribed')) {
                throw new Error('LLM Context not available in your Brave Search plan. Use Web Search mode instead.');
            }
        }
        throw new Error(`API error ${response.status}`);
    }
    const data = await response.json();
    const grounding = data.grounding || {};
    return {
        query,
        sources: ((_a = grounding.generic) === null || _a === void 0 ? void 0 : _a.map((item) => ({
            title: item.title,
            url: item.url,
            snippets: item.snippets,
        }))) || [],
        poi: grounding.poi ? {
            name: grounding.poi.name,
            url: grounding.poi.url,
            snippets: grounding.poi.snippets,
        } : null,
        mapResults: grounding.map || [],
        raw: data,
    };
}
class Bsearch {
    constructor() {
        this.description = {
            displayName: 'Brave Search',
            name: 'bsearch',
            icon: 'fa:search',
            group: ['output'],
            version: 1,
            description: 'Web search using Brave Search API with LLM Context support',
            defaults: { name: 'Brave Search' },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [
                {
                    name: 'bsearchApi',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Search Mode',
                    name: 'mode',
                    type: 'options',
                    options: [
                        { name: 'LLM Context', value: 'llm', description: 'Pre-extracted content for AI (default)' },
                        { name: 'Web Search', value: 'web', description: 'Classic web search with links' },
                    ],
                    default: 'llm',
                    description: 'Search mode: LLM Context (AI-optimized) or classic Web Search',
                },
                {
                    displayName: 'Query',
                    name: 'query',
                    type: 'string',
                    required: true,
                    default: '',
                    description: 'The search query string',
                    placeholder: 'e.g. n8n workflow automation',
                },
                {
                    displayName: 'Result Count',
                    name: 'count',
                    type: 'number',
                    typeOptions: { minValue: 1, maxValue: 50 },
                    default: 20,
                    description: 'Number of search results (1-50)',
                },
                {
                    displayName: 'Safe Search',
                    name: 'safesearch',
                    type: 'options',
                    options: [
                        { name: 'Off', value: 'off' },
                        { name: 'Moderate', value: 'moderate' },
                        { name: 'Strict', value: 'strict' },
                    ],
                    default: 'off',
                    displayOptions: { show: { mode: ['web'] } },
                },
                {
                    displayName: 'Freshness',
                    name: 'freshness',
                    type: 'string',
                    default: '',
                    displayOptions: { show: { mode: ['web'] } },
                    description: 'Filter by date: pd (day), pw (week), pm (month), py (year), or YYYY-MM-DDtoYYYY-MM-DD',
                    placeholder: 'e.g. pw',
                },
                {
                    displayName: 'Offset',
                    name: 'offset',
                    type: 'number',
                    default: 0,
                    displayOptions: { show: { mode: ['web'] } },
                    description: 'Pagination offset for web search',
                },
                // LLM Context Options
                {
                    displayName: 'Max Tokens',
                    name: 'maxTokens',
                    type: 'number',
                    typeOptions: { minValue: 1024, maxValue: 32768 },
                    default: 8192,
                    displayOptions: { show: { mode: ['llm'] } },
                    description: 'Max tokens in context (1024-32768)',
                },
                {
                    displayName: 'Max URLs',
                    name: 'maxUrls',
                    type: 'number',
                    typeOptions: { minValue: 1, maxValue: 50 },
                    default: 20,
                    displayOptions: { show: { mode: ['llm'] } },
                    description: 'Max URLs in response (1-50)',
                },
                {
                    displayName: 'Max Snippets',
                    name: 'maxSnippets',
                    type: 'number',
                    typeOptions: { minValue: 1, maxValue: 100 },
                    default: 50,
                    displayOptions: { show: { mode: ['llm'] } },
                    description: 'Max snippets total (1-100)',
                },
                {
                    displayName: 'Context Threshold',
                    name: 'threshold',
                    type: 'options',
                    options: [
                        { name: 'Strict', value: 'strict' },
                        { name: 'Balanced', value: 'balanced' },
                        { name: 'Lenient', value: 'lenient' },
                        { name: 'Disabled', value: 'disabled' },
                    ],
                    default: 'balanced',
                    displayOptions: { show: { mode: ['llm'] } },
                    description: 'Context threshold mode',
                },
                // Location Options
                {
                    displayName: 'Location',
                    name: 'location',
                    type: 'collection',
                    placeholder: 'Add location',
                    default: {},
                    options: [
                        {
                            displayName: 'Latitude',
                            name: 'lat',
                            type: 'number',
                            typeOptions: { numberPrecision: 6 },
                            default: undefined,
                            description: 'Latitude (-90 to 90)',
                        },
                        {
                            displayName: 'Longitude',
                            name: 'long',
                            type: 'number',
                            typeOptions: { numberPrecision: 6 },
                            default: undefined,
                            description: 'Longitude (-180 to 180)',
                        },
                        {
                            displayName: 'City',
                            name: 'city',
                            type: 'string',
                            default: '',
                        },
                        {
                            displayName: 'Country Code',
                            name: 'country',
                            type: 'string',
                            default: '',
                            placeholder: 'e.g. DE',
                        },
                    ],
                },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            const query = this.getNodeParameter('query', i);
            const mode = this.getNodeParameter('mode', i);
            const count = this.getNodeParameter('count', i);
            const location = this.getNodeParameter('location', i);
            const credentials = await this.getCredentials('bsearchApi');
            const apiKey = credentials.apiKey;
            if (!apiKey) {
                throw new Error('Brave Search API key not configured');
            }
            let result;
            if (mode === 'web') {
                const safesearch = this.getNodeParameter('safesearch', i);
                const freshness = this.getNodeParameter('freshness', i);
                const offset = this.getNodeParameter('offset', i);
                result = await performWebSearch(query, apiKey, count, safesearch, freshness, offset);
            }
            else {
                const maxTokens = this.getNodeParameter('maxTokens', i);
                const maxUrls = this.getNodeParameter('maxUrls', i);
                const maxSnippets = this.getNodeParameter('maxSnippets', i);
                const threshold = this.getNodeParameter('threshold', i);
                result = await performLlmContext(query, apiKey, count, maxTokens, maxUrls, maxSnippets, threshold, location);
            }
            returnData.push({
                json: result,
            });
        }
        return [returnData];
    }
}
exports.Bsearch = Bsearch;
