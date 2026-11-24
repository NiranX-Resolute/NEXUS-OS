import { r as reactExports, j as jsxRuntimeExports, ap as RiStickyNoteLine, G as RiAddLine, l as RiDeleteBinLine, w as RiCloseLine, x as RiSave3Line, aq as RiMarkdownLine, ar as RiEditLine, a6 as RiFileTextLine } from "./index-CYaMQ3cR.js";
import { M as Markdown, r as remarkGfm } from "./index-D_ENciI6.js";
const MarkdownComponents = {
  code({ node, inline, className, children, ...props }) {
    return !inline ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-black/50 rounded-lg p-3 my-2 border border-white/10 font-mono text-xs overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { ...props, children }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      "code",
      {
        className: "bg-white/10 px-1 py-0.5 rounded text-emerald-400 font-mono text-xs",
        ...props,
        children
      }
    );
  }
};
const NotesView = ({ glassPanel }) => {
  const [notes, setNotes] = reactExports.useState([]);
  const [selectedNote, setSelectedNote] = reactExports.useState(null);
  const [isEditorOpen, setIsEditorOpen] = reactExports.useState(false);
  const [newTitle, setNewTitle] = reactExports.useState("");
  const [newContent, setNewContent] = reactExports.useState("");
  const [editOriginalFilename, setEditOriginalFilename] = reactExports.useState(null);
  const fetchNotes = async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke("get-notes");
      setNotes(data);
    } catch (e) {
    }
  };
  reactExports.useEffect(() => {
    fetchNotes();
    const interval = setInterval(fetchNotes, 3e3);
    return () => clearInterval(interval);
  }, []);
  const startCreating = () => {
    setSelectedNote(null);
    setEditOriginalFilename(null);
    setNewTitle("");
    setNewContent("");
    setIsEditorOpen(true);
  };
  const startEditing = () => {
    if (!selectedNote) return;
    setEditOriginalFilename(selectedNote.filename);
    setNewTitle(selectedNote.title);
    const cleanContent = selectedNote.content.replace(/^# .+\n\n/, "");
    setNewContent(cleanContent);
    setIsEditorOpen(true);
  };
  const cancelEditor = () => {
    setIsEditorOpen(false);
    setEditOriginalFilename(null);
  };
  const saveManualNote = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    await window.electron.ipcRenderer.invoke(editOriginalFilename ? "update-note" : "save-note", {
      originalFilename: editOriginalFilename,
      title: newTitle,
      content: newContent
    });
    setIsEditorOpen(false);
    setEditOriginalFilename(null);
    fetchNotes();
    setTimeout(() => {
      window.electron.ipcRenderer.invoke("get-notes").then((data) => {
        const created = data.find(
          (n) => n.title.toLowerCase().includes(newTitle.toLowerCase().replace(/ /g, "_"))
        );
        if (created) setSelectedNote(created);
      });
    }, 500);
  };
  const deleteNote = async (filename, e) => {
    e.stopPropagation();
    await window.electron.ipcRenderer.invoke("delete-note", filename);
    fetchNotes();
    if (selectedNote?.filename === filename) setSelectedNote(null);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 bg-white/5 h-full grid grid-cols-12 gap-6 p-6 pb-20 animate-in fade-in zoom-in duration-300", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-4 flex flex-col gap-4 h-full overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pb-2 border-b border-white/10", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-zinc-100", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiStickyNoteLine, { className: "text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold tracking-widest", children: "MEMORY BANK" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 font-mono mr-2", children: [
            notes.length,
            " ITEMS"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: startCreating,
              className: "p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-black transition-all",
              title: "Create Manual Note",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiAddLine, { size: 14 })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto space-y-2 pr-2 pb-16 scrollbar-small", children: notes.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center text-zinc-400 text-xs mt-10", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No memories saved." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 opacity-50", children: "Click + or ask NEXUS." })
      ] }) : notes.map((note) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: () => {
            setIsEditorOpen(false);
            setSelectedNote(note);
          },
          className: `group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${selectedNote?.filename === note.filename && !isEditorOpen ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-zinc-900/40 border-white/5 hover:bg-white/5 hover:border-white/10"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "h3",
                {
                  className: `text-xs font-bold truncate ${selectedNote?.filename === note.filename && !isEditorOpen ? "text-emerald-100" : "text-zinc-200"}`,
                  children: note.title.toUpperCase()
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] text-zinc-500 mt-1 font-mono", children: new Date(note.createdAt).toLocaleDateString() })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => deleteNote(note.filename, e),
                className: "opacity-0 group-hover:opacity-100 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiDeleteBinLine, { size: 14 })
              }
            )
          ]
        },
        note.filename
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `col-span-8 ${glassPanel || ""} bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col overflow-hidden relative`,
        children: isEditorOpen ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-4 duration-300", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4 border-b border-white/10 pb-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                placeholder: "ENTER NOTE TITLE...",
                value: newTitle,
                onChange: (e) => setNewTitle(e.target.value),
                className: "bg-transparent border-none outline-none text-lg font-bold text-white placeholder-zinc-500 w-full tracking-wider",
                autoFocus: true
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: cancelEditor,
                className: "p-2 text-zinc-500 hover:text-white transition-colors",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 20 })
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              placeholder: "Write your note in Markdown...",
              value: newContent,
              onChange: (e) => setNewContent(e.target.value),
              className: "flex-1 bg-transparent border-none outline-none resize-none text-sm font-mono text-zinc-50 placeholder-zinc-500 leading-relaxed p-2 scrollbar-small"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: saveManualNote,
              disabled: !newTitle || !newContent,
              className: "flex items-center gap-2 px-6 py-2 bg-emerald-500 text-black font-bold text-xs rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiSave3Line, {}),
                " ",
                editOriginalFilename ? "UPDATE MEMORY" : "SAVE TO MEMORY"
              ]
            }
          ) })
        ] }) : selectedNote ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-12 border-b border-white/5 flex items-center justify-between px-6 bg-white/5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-zinc-300", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiMarkdownLine, { size: 18, className: "opacity-50" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold tracking-wider", children: selectedNote.title })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-zinc-400 bg-black/20 px-2 py-1 rounded", children: "READ ONLY" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: startEditing,
                  className: "text-zinc-500 hover:text-emerald-400 transition-colors",
                  title: "Edit Note",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiEditLine, { size: 16 })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto p-8 pb-24 scrollbar-small bg-zinc-950/30", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "prose prose-invert prose-sm max-w-none text-zinc-300", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Markdown, { remarkPlugins: [remarkGfm], components: MarkdownComponents, children: selectedNote.content }) }) })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col items-center justify-center text-zinc-200 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiFileTextLine, { size: 48, className: "opacity-20" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs tracking-widest opacity-50", children: "SELECT A DATA NODE OR CREATE NEW" })
        ] })
      }
    )
  ] });
};
export {
  NotesView as default
};
