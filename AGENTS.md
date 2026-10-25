<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Invitation role authorization is enforced by the invitations RLS insert policy; owners may invite managers/riders and managers may invite riders only, preventing client bypass.
- Platform support staff live in `platform_support`, checked via `is_platform_support()` in RLS; never grant support via partner roles — keeps cross-partner access separate.
- Outbound app emails go through `src/lib/resend.server.ts` (Resend connector, noreply@9javibemall.com.ng) — single sending path, no Lovable email domain configured.
- Delivery status/assignment alerts are created by the `notify_delivery_change` DB trigger, so every client path gets them.
- Sign-in/sign-up (auth) emails use Lovable managed email from notify.logistics.9javibemall.com.ng; app notification emails still go through Resend (src/lib/resend.server.ts) — why: user set up the Lovable sender domain for auth.
