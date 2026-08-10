import { Link, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { ComponentProps } from "react";

type ExternalLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href"
> & {
  href: Href;
};

export function ExternalLink({
  href,
  ...props
}: ExternalLinkProps) {
  return (
    <Link
      target="_blank"
      {...props}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== "web") {
          event.preventDefault();
          await WebBrowser.openBrowserAsync(String(href));
        }
      }}
    />
  );
}