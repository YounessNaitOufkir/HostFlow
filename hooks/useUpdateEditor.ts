import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import { MentionList } from "@/components/MentionList";
import { Profile } from "@/types";
import { useState } from "react";

export function useUpdateEditor(profiles: Profile[], placeholderText: string = "Write an update and mention others with @") {
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholderText,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'bg-blue-100 text-blue-600 px-1 rounded font-medium dark:bg-blue-900/40 dark:text-blue-400',
        },
        suggestion: {
          items: ({ query }) => {
            return profiles
              .filter(item => item.full_name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 5)
              .map(p => ({
                id: p.id,
                name: p.full_name,
                avatar: p.avatar_initials,
                color: p.color
              }));
          },
          render: () => {
            let component: ReactRenderer;
            let popup: any;

            return {
              onStart: props => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as any,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate(props) {
                component.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as any,
                });
              },
              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return (component.ref as any)?.onKeyDown(props);
              },
              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'text-blue-500 underline hover:text-blue-600 transition-colors cursor-pointer',
        },
      }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      setIsEditorEmpty(editor.isEmpty);
    },
    editorProps: {
      attributes: {
        class: 'prose-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] px-4 py-3 text-slate-900 dark:text-slate-100',
      },
    },
  });

  return { editor, isEditorEmpty, setIsEditorEmpty };
}
