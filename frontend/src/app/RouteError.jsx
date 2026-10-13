import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <section className="container section">
      <h1 style={{ fontSize: 56 }}>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p><Link to="/">Back to home</Link></p>
    </section>
  )
}
