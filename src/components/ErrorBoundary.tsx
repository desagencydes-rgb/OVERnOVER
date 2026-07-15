import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown instead of a blank screen when a child throws. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Stops one broken view from unmounting the entire app (which shows as a black
 * screen). Renders a readable message and a reload button instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[15px] font-semibold text-neutral-200">
            {this.props.label ?? 'Something went wrong here'}
          </p>
          <p className="max-w-xs break-words text-[12px] text-neutral-500">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-full bg-raised px-5 py-2 text-[14px] font-medium"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
