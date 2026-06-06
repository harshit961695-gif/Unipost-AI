/**
 * ServiceResponse type — shared across service modules.
 * 
 * NOTE: The original supabaseService methods (getPosts, createPost, logPostAction)
 * have been removed. Those wrote to Supabase ghost tables that drifted from the
 * primary Neon database. All posts/post_logs operations now go through Prisma.
 * See: database_responsibility_audit.md
 */
export type ServiceResponse<T> = {
  data: T | null
  error: string | null
}
