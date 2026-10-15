import registryJson from './mappings/id-registry.json';
import type { RegistryEntry } from '@domain/sharing/migrate';

export const talentRegistry = registryJson as unknown as Record<string, RegistryEntry>;
