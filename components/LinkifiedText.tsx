"use client";

import { linkifyText } from "@/lib/linkify";

type LinkifiedTextProps = {
  text: string;
  className?: string;
};

export function LinkifiedText({ text, className = "" }: LinkifiedTextProps) {
  return (
    <p className={className}>
      {linkifyText(text).map((segment, index) => {
        if (segment.type === "text") return <span key={index}>{segment.text}</span>;

        return (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-type-link hover:underline break-words"
          >
            {segment.text}
          </a>
        );
      })}
    </p>
  );
}
