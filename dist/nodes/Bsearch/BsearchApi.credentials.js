"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BsearchApi = void 0;
class BsearchApi {
    constructor() {
        this.name = 'bsearchApi';
        this.displayName = 'Brave Search API';
        this.documentationUrl = 'https://api.search.brave.com/res/v1/llm/context';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                description: 'Your Brave Search API key (X-Subscription-Token)',
            },
        ];
    }
}
exports.BsearchApi = BsearchApi;
