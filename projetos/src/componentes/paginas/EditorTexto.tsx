import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { enviarImagemDaPagina } from '@/estado/paginas';
import { mensagemDeErro } from '@/estado/dados';

interface Props {
  conteudo: string;
  projetoId: string;
  aoMudar: (html: string) => void;
}

export default function EditorTexto({ conteudo, projetoId, aoMudar }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoImagem = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg border border-linha' } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-roxo-escuro underline' } }),
      Placeholder.configure({
        placeholder: 'Escreva aqui. Cole um print com Ctrl+V para ilustrar o comportamento da tela.',
      }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: conteudo,
    onUpdate: ({ editor: e }) => aoMudar(e.getHTML()),
    editorProps: {
      attributes: { class: 'prosa min-h-[220px] px-4 py-3 outline-none' },
      /* Colar print e o caminho natural de quem esta documentando tela:
         sem isto o Ctrl+V traria a imagem como base64 gigante dentro do
         HTML, inchando a pagina e o banco. */
      handlePaste: (_visao, evento) => {
        const arquivos = [...(evento.clipboardData?.files ?? [])];
        const imagem = arquivos.find((a) => a.type.startsWith('image/'));
        if (!imagem) return false;
        evento.preventDefault();
        void subir(imagem);
        return true;
      },
      handleDrop: (_visao, evento) => {
        const arquivos = [...((evento as DragEvent).dataTransfer?.files ?? [])];
        const imagem = arquivos.find((a) => a.type.startsWith('image/'));
        if (!imagem) return false;
        evento.preventDefault();
        void subir(imagem);
        return true;
      },
    },
  });

  const subir = useCallback(async (arquivo: File) => {
    setEnviando(true);
    setErro(null);
    try {
      const url = await enviarImagemDaPagina(arquivo, projetoId);
      editor?.chain().focus().setImage({ src: url, alt: arquivo.name }).run();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setEnviando(false);
    }
  }, [editor, projetoId]);

  /* O conteudo so e reinjetado quando muda por fora (troca de pagina,
     restauracao de versao). Reinjetar a cada digito jogaria o cursor
     para o inicio a cada tecla. */
  useEffect(() => {
    if (editor && conteudo !== editor.getHTML()) editor.commands.setContent(conteudo, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudo, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-linha bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-linha px-2 py-1.5">
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleBold().run()} ativo={editor.isActive('bold')} titulo="Negrito"><b>N</b></Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleItalic().run()} ativo={editor.isActive('italic')} titulo="Itálico"><i>I</i></Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleStrike().run()} ativo={editor.isActive('strike')} titulo="Riscado"><s>S</s></Ferramenta>
        <Divisor />
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleHeading({ level: 2 }).run()} ativo={editor.isActive('heading', { level: 2 })} titulo="Título">T1</Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleHeading({ level: 3 }).run()} ativo={editor.isActive('heading', { level: 3 })} titulo="Subtítulo">T2</Ferramenta>
        <Divisor />
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleBulletList().run()} ativo={editor.isActive('bulletList')} titulo="Lista">•</Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleOrderedList().run()} ativo={editor.isActive('orderedList')} titulo="Lista numerada">1.</Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleBlockquote().run()} ativo={editor.isActive('blockquote')} titulo="Citação">❝</Ferramenta>
        <Ferramenta editor={editor} acao={(e) => e.chain().focus().toggleCodeBlock().run()} ativo={editor.isActive('codeBlock')} titulo="Código">{'</>'}</Ferramenta>
        <Divisor />
        <Ferramenta
          editor={editor} titulo="Link" ativo={editor.isActive('link')}
          acao={(e) => {
            const atual = e.getAttributes('link').href as string | undefined;
            const url = prompt('Endereço do link:', atual ?? 'https://');
            if (url === null) return;
            if (!url) { e.chain().focus().unsetLink().run(); return; }
            e.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
        >🔗</Ferramenta>
        <Ferramenta
          editor={editor} titulo="Tabela"
          acao={(e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >▦</Ferramenta>
        <Ferramenta editor={editor} titulo="Imagem" acao={() => campoImagem.current?.click()}>
          {enviando ? '…' : '🖼'}
        </Ferramenta>
        <span className="ml-auto text-[11px] text-tinta-suave">
          {enviando ? 'Enviando imagem…' : 'Ctrl+V cola print'}
        </span>
        <input
          ref={campoImagem} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const a = e.target.files?.[0]; if (a) void subir(a); e.target.value = ''; }}
        />
      </div>

      <EditorContent editor={editor} />

      {erro && <p className="border-t border-linha px-4 py-2 text-xs text-vermelho">{erro}</p>}
    </div>
  );
}

function Ferramenta({ editor, acao, ativo, titulo, children }: {
  editor: Editor; acao: (e: Editor) => void; ativo?: boolean; titulo: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={titulo} onClick={() => acao(editor)}
      className={`h-7 min-w-7 rounded px-1.5 text-xs font-bold transition ${
        ativo ? 'bg-roxo-suave text-roxo-escuro' : 'text-tinta-suave hover:bg-papel'
      }`}
    >{children}</button>
  );
}

const Divisor = () => <span className="mx-1 h-4 w-px bg-linha" />;
