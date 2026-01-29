/**
 * Supabase placeholder
 *
 * Provides a minimal, non-functional supabase-like client so existing call sites
 * fail gracefully after the dependency removal.
 */

export type AppRole =
	| 'owner'
	| 'admin'
	| 'manager'
	| 'staff'
	| 'viewer'
	| 'inspector'
export type ComplianceMode = 'standard' | 'haccp'

export type Database = {
	public: {
		Enums: {
			app_role: AppRole
			compliance_mode: ComplianceMode
		}
	}
}

export type Json = unknown

/**
 * Error class for features that are unavailable during migration.
 * UI components can check for this error type to show user-friendly messages.
 */
export class SupabaseMigrationError extends Error {
	readonly isSupabaseMigration = true
	readonly featureName?: string

	constructor(message: string, featureName?: string) {
		super(message)
		this.name = 'SupabaseMigrationError'
		this.featureName = featureName
	}
}

/**
 * Helper to check if an error is a SupabaseMigrationError.
 * Works across module boundaries where instanceof might fail.
 */
export function isSupabaseMigrationError(
	error: unknown
): error is SupabaseMigrationError {
	return (
		error instanceof SupabaseMigrationError ||
		(error !== null &&
			typeof error === 'object' &&
			'isSupabaseMigration' in error)
	)
}

const MIGRATION_MESSAGE =
	'This feature is temporarily unavailable while being migrated to the new backend.'

let warned = false

function warnOnce() {
	if (warned) return
	warned = true
	console.warn('[supabase-placeholder] Supabase calls are disabled.')
}

const placeholderResult = {
	data: null,
	error: new SupabaseMigrationError(MIGRATION_MESSAGE),
	count: null,
}

function createQuery() {
	const query = {
		select: () => query,
		insert: () => query,
		update: () => query,
		delete: () => query,
		eq: () => query,
		in: () => query,
		is: () => query,
		not: () => query,
		order: () => query,
		limit: () => query,
		maybeSingle: () => query,
		single: () => query,
		then: (
			resolve: (value: typeof placeholderResult) => void,
			reject?: (reason: unknown) => void
		) => {
			warnOnce()
			return Promise.resolve(placeholderResult).then(resolve, reject)
		},
	}
	return query
}

function createChannel() {
	const channel = {
		on: () => channel,
		subscribe: () => channel,
		unsubscribe: () => {},
	}
	warnOnce()
	return channel
}

export const supabase = {
	from: () => createQuery(),
	rpc: async (functionName: string) => {
		warnOnce()
		return {
			data: null,
			error: new SupabaseMigrationError(
				`${MIGRATION_MESSAGE} (${functionName})`,
				functionName
			),
			__unavailable: functionName,
		}
	},
	functions: {
		invoke: async (functionName: string) => {
			warnOnce()
			return {
				data: null,
				error: new SupabaseMigrationError(
					`${MIGRATION_MESSAGE} (${functionName})`,
					functionName
				),
				__unavailable: functionName,
			}
		},
	},
	channel: () => createChannel(),
	removeChannel: () => {},
}
