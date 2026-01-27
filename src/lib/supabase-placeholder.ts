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

const supabaseRemovedError = new Error(
	'Supabase integration removed. This feature is unavailable until migrated.',
)

let warned = false

function warnOnce() {
	if (warned) return
	warned = true
	console.warn('[supabase-placeholder] Supabase calls are disabled.')
}

const placeholderResult = {
	data: null,
	error: supabaseRemovedError,
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
		then: (resolve, reject) => {
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
	rpc: async () => {
		warnOnce()
		return placeholderResult
	},
	functions: {
		invoke: async () => {
			warnOnce()
			return placeholderResult
		},
	},
	channel: () => createChannel(),
	removeChannel: () => {},
}
