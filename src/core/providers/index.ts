import { InstancePool } from './instances/pool'
import { MultiProvider } from './multi'

/** App-wide singletons. Core code and UI import these, never concrete providers. */
export const pool = new InstancePool()
export const provider = new MultiProvider(pool)
