import { useTRPC } from './lib/trpc'

function TestTRPC() {
	const trpc = useTRPC()

	// Log type info
	console.log('trpc', trpc)
	console.log('trpc.audit', trpc.audit)
	console.log('trpc.audit.logEvent', trpc.audit.logEvent)
	console.log('typeof trpc.audit.logEvent', typeof trpc.audit.logEvent)
	console.log(
		'Object.keys(trpc.audit.logEvent)',
		Object.keys(trpc.audit.logEvent),
	)

	return null
}

export default TestTRPC
