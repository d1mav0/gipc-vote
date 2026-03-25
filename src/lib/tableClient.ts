import { TableClient, TableServiceClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;

export function getTableClient(tableName: string) {
  return TableClient.fromConnectionString(connectionString, tableName);
}

export async function ensureTables() {
  const service = TableServiceClient.fromConnectionString(connectionString);
  for (const name of ['rounds', 'votes']) {
    try {
      await service.createTable(name);
    } catch {
      // table already exists
    }
  }
}

export interface Round {
  partitionKey: string;
  rowKey: string;
  name: string;
  competitors: string; // JSON array of strings
  status: 'draft' | 'open' | 'closed';
}

export interface Vote {
  partitionKey: string;
  rowKey: string;
  competitor: string;
  voterHash: string;
}
