import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "../content";
import { CodeBlock } from "@/components/code-block";
import { Sticker } from "@/components/sticker";

const AIX = `E user name:str!, email:str!~
E post title:str!<=200, body:str!, author>user, created@
R post list:mine, get, create, update:[title,body], delete`;

// Same owner-scoped blog backend, the conventional way. Order matches compare.items.
const SAMPLES = [
  `// schema.prisma
model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String
  authorId  String
  createdAt DateTime @default(now())
}

// app/api/posts/route.ts
export async function POST(req: Request) {
  const user = await requireAuth(req)              // you write this
  const data = PostSchema.parse(await req.json())  // zod validation
  const post = await prisma.post.create({
    data: { ...data, authorId: user.id },          // ownership by hand
  })
  return Response.json(post, { status: 201 })
}
// + GET list-mine, GET /:id, PATCH (field-lock by hand), DELETE — one file each`,

  `# app/models/post.rb
class Post < ApplicationRecord
  belongs_to :author, class_name: "User"
  validates :title, presence: true, length: { maximum: 200 }
end

# app/controllers/posts_controller.rb
class PostsController < ApplicationController
  before_action :authenticate_user!
  def index = render json: current_user.posts        # scope by hand
  def create
    post = current_user.posts.create!(post_params)   # ownership by hand
    render json: post, status: :created
  end
  private
  def post_params = params.require(:post).permit(:title, :body)  # field-lock
end`,

  `# models.py
class Post(models.Model):
    title  = models.CharField(max_length=200)
    body   = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE)

# views.py
class PostViewSet(viewsets.ModelViewSet):
    serializer_class   = PostSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        return Post.objects.filter(author=self.request.user)   # scope by hand
    def perform_create(self, s):
        s.save(author=self.request.user)                       # ownership by hand`,

  `-- schema.sql
CREATE TABLE post (
  id      SERIAL PRIMARY KEY,
  title   TEXT NOT NULL CHECK (length(title) <= 200),
  body    TEXT NOT NULL,
  author  TEXT NOT NULL,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- then a hand-written endpoint per route, each doing its own
-- auth check, body validation, and WHERE author = $current_user
-- create / list-mine / get / update (locked fields) / delete`,
];

export default async function Compare({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).compare;

  return (
    <article className="space-y-5">
      <h1 className="font-display text-[30px] leading-none text-ink sm:text-[40px]">{d.title}</h1>
      <p className="font-body text-[15px] leading-[1.55] text-ink">{d.lead}</p>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Sticker>{d.aixLabel}</Sticker>
        </div>
        <CodeBlock title="aix" code={AIX} />
      </div>

      <h2 className="border-b border-ink pb-1 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
        {d.colSame}
      </h2>

      <div className="space-y-6">
        {d.items.map((item: { name: string; note: string; takeaway: string }, i: number) => (
          <section key={item.name} className="space-y-2">
            <h3 className="font-ui text-[15px] font-bold uppercase tracking-wide text-ink">{item.name}</h3>
            <p className="font-body text-[14px] leading-[1.5] text-ink">{item.note}</p>
            <CodeBlock code={SAMPLES[i]} />
            <p className="border-l-4 border-salmon bg-salmon/15 px-3 py-1.5 font-body text-[13px] leading-[1.5] text-ink">
              → {item.takeaway}
            </p>
          </section>
        ))}
      </div>

      <p className="border border-ink bg-steel/30 px-4 py-3 font-body text-[14px] leading-[1.55] text-ink">
        {d.closing}
      </p>
    </article>
  );
}
