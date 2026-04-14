/**
 * GET /api/operations/:kind/:id/logs
 *
 * Returns the full OperationLogEntry history for one scoped long-running
 * operation. v1 supports:
 *
 *   • CloudDeploy         — kind=CloudDeploy, id=<applicationId>
 *   • GitRemoteCreate     — kind=GitRemoteCreate, id=<applicationId>
 *
 * The route delegates to ListOperationLogEntriesUseCase — it never touches
 * the repository directly, so the clean-architecture read path stays:
 *   route → use case → service port → repository.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { ListOperationLogEntriesUseCase } from '@shepai/core/application/use-cases/operations/list-operation-log-entries.use-case';
import {
  OperationLogKind,
  type OperationLogKind as OperationLogKindType,
  type OperationLogEntry,
} from '@shepai/core/domain/generated/output';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ kind: string; id: string }>;
}

function parseKind(raw: string): OperationLogKindType | null {
  const allowed = Object.values(OperationLogKind) as string[];
  return allowed.includes(raw) ? (raw as OperationLogKindType) : null;
}

/**
 * Shape returned to the client. Dates are serialised to ISO strings so the
 * client doesn't have to coerce — `JSON.stringify(new Date())` would
 * already produce ISO, but we stay explicit to keep the DTO easy to mock.
 */
interface OperationLogEntryDto {
  id: string;
  operationKind: OperationLogKindType;
  operationId: string;
  level: string;
  message: string;
  detail?: string;
  createdAt: string;
}

function toDto(entry: OperationLogEntry): OperationLogEntryDto {
  return {
    id: entry.id,
    operationKind: entry.operationKind,
    operationId: entry.operationId,
    level: entry.level as string,
    message: entry.message,
    detail: entry.detail,
    createdAt:
      entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : new Date(entry.createdAt as unknown as string | number).toISOString(),
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { kind: rawKind, id } = await params;
    const kind = parseKind(rawKind);
    if (!kind) {
      return NextResponse.json(
        {
          error: `Unknown operation kind: ${rawKind}. Expected one of: ${Object.values(OperationLogKind).join(', ')}`,
        },
        { status: 400 }
      );
    }
    if (!id || id.trim().length === 0) {
      return NextResponse.json({ error: 'Missing operation id' }, { status: 400 });
    }

    const useCase = resolve<ListOperationLogEntriesUseCase>('ListOperationLogEntriesUseCase');
    const entries = await useCase.execute({ kind, id });
    return NextResponse.json({ entries: entries.map(toDto) });
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    return NextResponse.json({ error: message, code }, { status: 500 });
  }
}
