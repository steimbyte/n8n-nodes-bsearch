import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class BsearchApi implements ICredentialType {
  name = 'bsearchApi';
  displayName = 'Brave Search API';
  documentationUrl = 'https://api.search.brave.com/res/v1/llm/context';
  properties: INodeProperties[] = [
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
