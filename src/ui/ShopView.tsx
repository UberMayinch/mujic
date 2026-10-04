/**
 * The record shop: browse stems, and put your own on the shelf.
 *
 * A stem here is pattern JSON — a few tracks and what they play over one
 * section. Buying one inserts those tracks into the section you're looking at
 * as ordinary cells, after which it is indistinguishable from something you
 * made: voice-editable, diffable, yours. That is only possible because nothing
 * on this shelf is audio.
 */

import { useMemo, useState } from "react";
import { extractStem, formatPrice, sellableTracks, type Stem } from "../model/stem";
import type { ProjectDoc } from "../model/project";
import { Disc } from "./Disc";

type Props = {
  doc: ProjectDoc;
  sectionIndex: number;
  catalogue: Stem[];
  busy?: boolean;
  onBuy: (stem: Stem) => void;
  onPublish: (stem: Stem) => void;
};

const TAGS = ["All", "Drums", "Keys", "Bass", "Kit", "Full"];

export function ShopView({ doc, sectionIndex, catalogue, busy, onBuy, onPublish }: Props) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");
  const [selling, setSelling] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue.filter((stem) => {
      if (tag !== "All" && stem.tag !== tag.toUpperCase()) return false;
      if (!needle) return true;
      // Tempo is a real search term when crate-digging, so bpm is searchable text.
      return `${stem.title} ${stem.seller} ${stem.tag} ${stem.key} ${stem.bpm}`
        .toLowerCase()
        .includes(needle);
    });
  }, [catalogue, query, tag]);

  const section = doc.sections[sectionIndex];

  return (
    <div className="shop">
      <div className="shop-bar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stems — “halftime”, “rhodes”, “92”"
        />
        {TAGS.map((t) => (
          <button key={t} className={tag === t ? "on small" : "small"} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
        <button className="small" onClick={() => setSelling((s) => !s)}>
          {selling ? "✕ cancel" : "＋ sell a stem"}
        </button>
      </div>

      {selling && section && (
        <PublishForm
          doc={doc}
          sectionIndex={sectionIndex}
          onPublish={(stem) => {
            onPublish(stem);
            setSelling(false);
          }}
        />
      )}

      <div>
        <div className="shelf-head">
          <h3>{tag === "All" ? "Everything" : tag}</h3>
          <span>
            {shown.length} {shown.length === 1 ? "stem" : "stems"}
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="hint">Nothing on this shelf yet.</p>
        ) : (
          <div className="shelf">
            {shown.map((stem) => (
              <article key={stem.id} className="disc-card">
                <Disc stem={stem} />
                <div className="disc-meta">
                  <b>{stem.title}</b>
                  <span className="by">{stem.seller}</span>
                </div>
                <div className="disc-foot">
                  <span className="price">{formatPrice(stem.priceCents)}</span>
                  <button
                    className="small"
                    disabled={busy || !section}
                    title={section ? `Add to ${section.name}` : "no section selected"}
                    onClick={() => onBuy(stem)}
                  >
                    Add to {section?.name ?? "…"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Capture the current section's tracks as a stem and put it on the shelf. */
function PublishForm({
  doc,
  sectionIndex,
  onPublish,
}: {
  doc: ProjectDoc;
  sectionIndex: number;
  onPublish: (stem: Stem) => void;
}) {
  const candidates = sellableTracks(doc);
  const [picked, setPicked] = useState<string[]>(() => candidates.map((t) => t.id));
  const [title, setTitle] = useState("");
  const [seller, setSeller] = useState("");
  const [price, setPrice] = useState("4.00");
  const [key, setKey] = useState("");
  const [tag, setTag] = useState("Drums");

  const section = doc.sections[sectionIndex];

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const publish = () => {
    const cents = Math.round(Number(price.replace(/[^0-9.]/g, "")) * 100);
    onPublish(
      extractStem(doc, sectionIndex, picked, {
        title,
        seller,
        priceCents: Number.isFinite(cents) ? cents : 0,
        key,
        tag,
      }),
    );
  };

  return (
    <div className="publish">
      <h2>Sell from “{section.name}”</h2>

      <div className="track-picks">
        {candidates.map((track) => (
          <label key={track.id}>
            <input
              type="checkbox"
              checked={picked.includes(track.id)}
              onChange={() => toggle(track.id)}
            />
            {track.name}
          </label>
        ))}
      </div>

      <div className="row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="Your name" />
      </div>

      <div className="row">
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price, e.g. 4.00" />
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key, e.g. F min" />
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          {["Drums", "Keys", "Bass", "Kit", "Full"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className="on" disabled={picked.length === 0} onClick={publish}>
          Put on the shelf
        </button>
      </div>

      <p className="hint">
        Only patterns leave your project — the tracks you tick, as they play in this section.
        Recorded takes are never included: selling someone’s voice is a different product
        with different consent questions.
      </p>
    </div>
  );
}
