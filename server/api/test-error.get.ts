export default defineEventHandler(() => {
  const err = createError({
    statusCode: 500,
    message: 'Test server error from /api/test-error',
  })
  console.log('[test-error] stack:', err.stack)
  throw err
})
