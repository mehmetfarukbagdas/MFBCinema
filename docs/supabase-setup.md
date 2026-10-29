# Supabase setup

1. Create a Supabase project and review `supabase/schema.sql` before applying it.
2. Run the schema in the Supabase SQL Editor against the intended project.
3. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the project URL and publishable key.
4. In Supabase Authentication settings, configure the local URL and the deployed Vercel URL under Site URL and Redirect URLs.
5. Test sign-up, email verification, sign-in, sign-out, watchlist, favourites, reviews, and admin permissions using non-production test accounts.
6. Review the Row Level Security policies in `supabase/schema.sql` before adding real user data.

Never expose the Supabase service-role key or database credentials in frontend environment variables or source code. Values prefixed with `VITE_` are included in the browser bundle and must not be treated as secrets.
