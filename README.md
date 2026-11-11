# AutoPromo — Fases 1 e 2

Marketplace de carros usados para os EUA, onde **donos** anunciam e **promotores** indicam compradores em troca de comissão.
O site está todo em inglês americano (USD, milhas, MM/DD/YYYY).

**Stack:** React 18 + Vite + TypeScript + Tailwind (componentes no estilo shadcn/ui) + Supabase (Auth, Postgres com RLS, Storage).

## O que já funciona

| Área | Funcionalidades |
|---|---|
| Autenticação | Cadastro e login com e-mail/senha e Google, verificação de e-mail, recuperar e redefinir senha, aceite dos Terms |
| Onboarding | Escolha do perfil no primeiro acesso (vender / promover / só olhando) e troca de modo no menu |
| Páginas públicas | Home (busca, destaques, como funciona, depoimentos, CTAs), listagem com filtros + **ZIP e raio em milhas** + ordenação + paginação, página do carro (galeria com tela cheia, specs, VIN mascarado, selo Verified Owner, carros parecidos), How it works, FAQ, Terms, Privacy, 404 |
| Área do dono | Painel com números, **wizard de anúncio em 5 etapas**, upload de até 20 fotos com arrastar e soltar, reordenação, escolha de capa, compressão no navegador, comissão fixa ou %, rascunho, publicação, troca de status (ativo, venda pendente, pausado, vendido) e exclusão |
| Promotores (Fase 2) | Termo do promotor, painel com cliques, visitantes únicos e ganhos possíveis, busca de carros para promover (por ZIP, raio e comissão mínima), pedido para promover com mensagem, **aprovação automática** para promotores verificados quando o dono permite |
| Links de indicação (Fase 2) | Link curto `/r/CODIGO` por carro, botões para Facebook, WhatsApp, SMS e e-mail, **QR code** para baixar, **kit de divulgação** (imagem quadrada 1080×1080 com foto, preço e QR, mais texto pronto) |
| Rastreio (Fase 2) | Cada visita com `?ref=` registra um clique (sem duplicar visitas repetidas em 30 min e ignorando o próprio promotor e o dono) e grava um cookie de 30 dias, que será usado no chat e nas vendas |
| Dono x promotores (Fase 2) | Tela **Promoters**: aprovar ou recusar pedidos, ver quantos cliques cada promotor trouxe e remover promotores |
| Banco | Tabelas, RLS, regras no banco (limite de anúncios, estados liberados, máx. 20 fotos), busca geográfica, contador de visualizações, bucket de fotos |

Os botões **Contact** e **Schedule a visit** já aparecem, mas o chat e o agendamento chegam na Fase 3.

## 1. Configurar o Supabase

> **Já está pronto:** o projeto **autopromo** foi criado na sua conta do Supabase (organização "adega capital", região East US), com as 3 migrações e os dados de teste (Fases 1 e 2) aplicados. O arquivo `.env` já vem com a URL e a chave pública. Faltam só os passos 4 a 7 abaixo, que são feitos no painel.
>
> URL: `https://scvdvwryiuthnzwsyade.supabase.co`

Para montar do zero em outro projeto:

1. Crie um projeto em [supabase.com](https://supabase.com). Para o público americano, escolha a região **East US**.
2. Vá em **SQL Editor** e rode, em ordem, os arquivos da pasta `supabase/migrations/`.
3. (Opcional, para testar) Rode também `supabase/seed.sql`. Ele cria 12 carros no Texas e 3 donos de teste (senha `AutoPromo#2026`):
   - `sarah.owner@demo.autopromo.test`
   - `mike.owner@demo.autopromo.test`
   - `linda.owner@demo.autopromo.test`

   E rode `supabase/seed_phase2.sql` para criar um promotor de teste com links e cliques: `carlos.promoter@demo.autopromo.test` (mesma senha).

   Os carros de teste não têm fotos. Faça login com um desses usuários e adicione fotos pelo painel. **Não rode o seed em produção.**
4. Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email** ligado.
5. Em **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173` (depois troque pelo domínio real)
   - **Redirect URLs:** adicione `http://localhost:5173/**` e, depois, `https://seudominio.com/**`
6. **Login com Google:** em **Authentication → Providers → Google**, ative e cole o Client ID e o Secret criados no [Google Cloud Console](https://console.cloud.google.com/apis/credentials). No Google, use como "Authorized redirect URI" a URL de callback que o Supabase mostra nessa mesma tela.
7. **Primeiro admin:** depois de criar sua conta, rode no SQL Editor:
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'SEU@EMAIL.com');
   ```

## 2. Rodar o site

```bash
# o .env já vem preenchido com o projeto autopromo
npm install
npm run dev             # http://localhost:5173
```

Para publicar: `npm run build` gera a pasta `dist/`. O arquivo `public/_redirects` já está pronto para Netlify, e o `vercel.json` para Vercel. Lembre de cadastrar as variáveis `VITE_SUPABASE_*` no painel da hospedagem.

## 3. Configurações da plataforma

A tabela `platform_settings` (uma linha só) controla:

| Coluna | Padrão | Para que serve |
|---|---|---|
| `enabled_states` | `{TX}` | Estados onde é possível publicar. Ex.: `update platform_settings set enabled_states = '{TX,FL}';` |
| `max_listings_per_user` | `5` | Máximo de anúncios abertos por pessoa |
| `default_commission_type` / `default_commission_value` | `fixed` / `300` | Comissão sugerida no wizard |
| `platform_fee_percent` | `10` | Taxa da plataforma sobre a comissão (usada na Fase 4) |

Na Fase 5 isso vira uma tela no painel admin.

## 4. Segurança

- **RLS em todas as tabelas.** Ninguém edita anúncio, foto ou perfil de outra pessoa.
- **Proteção por coluna.** Pelo navegador, um usuário não consegue se tornar admin, se marcar como verificado, mexer nas visualizações etc.
- **VIN completo** fica na tabela `car_private`, que só o dono vê. O público vê só os 6 últimos caracteres.
- **Fotos** ficam em `car-photos/<user_id>/<car_id>/`, e cada usuário só grava na própria pasta.
- **As regras de negócio** (estado liberado, limite de anúncios, preço e local obrigatórios para publicar) rodam no banco e não podem ser burladas pelo front.

Essas regras foram testadas num Postgres local que imita o Supabase.

## 5. Estrutura

```
src/
  components/
    auth/        RequireAuth, AuthShell (botão Google)
    cars/        CarCard, CarImage, PhotoManager
    promoter/    PromoKit (links, compartilhar, QR code, kit de divulgação)
    layout/      Header, Footer, Layout, DashboardLayout, Logo
    ui/          button, input/select/textarea/field, misc (card, badge, alert, avatar…)
  context/       AuthContext (sessão, perfil, modo ativo)
  hooks/         useDocumentTitle, usePlatformSettings
  lib/           supabase, cars (busca), listings (CRUD + fotos), promotions (promotores), zip, referral (cliques), image, utils, constants, types
  pages/         Home, Cars, CarDetail, ReferralRedirect (/r/CODE), StaticPages, auth/*, dashboard/* (incl. promoter/*)
supabase/
  migrations/    SQL da Fase 1
  seed.sql       dados de teste
```

O ZIP é convertido em cidade, estado e coordenadas pela API gratuita [Zippopotam.us](https://zippopotam.us), sem chave.

## Próximas fases

3. Chat em tempo real com anti-bypass, e agendamento de visitas
4. Confirmação de venda, comissões, Stripe Connect e disputas
5. Avaliações, denúncias e painel admin
6. Polimento, SEO e performance

> Os textos de Terms of Service e Privacy Policy são modelos e precisam ser revisados por um advogado americano antes do lançamento.
