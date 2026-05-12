import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  NodeOutput,
  INodeExecutionData,
} from 'n8n-workflow';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export class Bsearch implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Brave Search',
    name: 'bsearch',
    icon: 'fa:search',
    group: ['output'],
    version: 1,
    description: 'Web search using bsearch CLI - configure API key in node settings',
    defaults: { name: 'Brave Search' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      // API Key in Settings
      {
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description: 'Brave Search API key (from brave.com/search/api). Set in node settings.',
      },
      {
        displayName: 'Search Mode',
        name: 'mode',
        type: 'options',
        options: [
          { name: 'LLM Context', value: 'llm', description: 'Pre-extracted content for AI (default)' },
          { name: 'Web Search', value: 'web', description: 'Classic web search with links' },
        ],
        default: 'llm',
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
        placeholder: 'e.g. pw',
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        default: 0,
        displayOptions: { show: { mode: ['web'] } },
      },
      {
        displayName: 'Max Tokens',
        name: 'maxTokens',
        type: 'number',
        typeOptions: { minValue: 1024, maxValue: 32768 },
        default: 8192,
        displayOptions: { show: { mode: ['llm'] } },
      },
      {
        displayName: 'Max URLs',
        name: 'maxUrls',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 50 },
        default: 20,
        displayOptions: { show: { mode: ['llm'] } },
      },
      {
        displayName: 'Max Snippets',
        name: 'maxSnippets',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 50,
        displayOptions: { show: { mode: ['llm'] } },
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
      },
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
            default: 0,
          },
          {
            displayName: 'Longitude',
            name: 'long',
            type: 'number',
            typeOptions: { numberPrecision: 6 },
            default: 0,
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

  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    // Get API key from node settings (first item or node settings)
    const apiKey = (this.getNodeParameter('apiKey', 0) as string) || '';

    if (!apiKey) {
      throw new Error('Brave Search API key not configured. Set it in the node settings.');
    }

    for (let i = 0; i < items.length; i++) {
      const query = this.getNodeParameter('query', i) as string;
      const mode = this.getNodeParameter('mode', i) as string;
      const count = this.getNodeParameter('count', i) as number;
      const location = this.getNodeParameter('location', i) as Record<string, any>;

      // Build bsearch command
      const args = [query];

      if (mode === 'web') {
        args.push('--web');
        const safesearch = this.getNodeParameter('safesearch', i) as string;
        if (safesearch !== 'off') args.push('--safesearch', safesearch);
        const freshness = this.getNodeParameter('freshness', i) as string;
        if (freshness) args.push('--freshness', freshness);
        const offset = this.getNodeParameter('offset', i) as number;
        if (offset > 0) args.push('--offset', offset.toString());
      } else {
        args.push('--llm');
        args.push('--count', count.toString());
        args.push('--max-tokens', (this.getNodeParameter('maxTokens', i) as number).toString());
        args.push('--max-urls', (this.getNodeParameter('maxUrls', i) as number).toString());
        args.push('--max-snippets', (this.getNodeParameter('maxSnippets', i) as number).toString());
        args.push('--threshold', this.getNodeParameter('threshold', i) as string);
      }

      // Location params
      if (location.lat) args.push('--lat', location.lat.toString());
      if (location.long) args.push('--long', location.long.toString());
      if (location.city) args.push('--city', location.city);
      if (location.country) args.push('--country', location.country);

      // Raw JSON output
      args.push('--raw');

      // Create temp env file with API key
      const envFile = join(tmpdir(), `bsearch_env_${Date.now()}.txt`);
      writeFileSync(envFile, `BRAVE_API_KEY=${apiKey}`);

      try {
        const cmd = `BRAVE_API_KEY_FILE=${envFile} bsearch ${args.join(' ')}`;
        const { stdout } = await execAsync(cmd);

        const result = JSON.parse(stdout);

        returnData.push({
          json: {
            query,
            mode,
            ...result,
          },
        } as INodeExecutionData);
      } catch (error: any) {
        throw new Error(`bsearch CLI error: ${error.message}`);
      } finally {
        // Cleanup temp file
        try { unlinkSync(envFile); } catch {}
      }
    }

    return [returnData];
  }
}
