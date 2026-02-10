interface ReactComponentRendererProps {
  content: string;
  title?: string;
  language?: string;
}

export function ReactComponentRenderer({ content }: ReactComponentRendererProps) {
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const Component = () => {
      ${content}
    };
    ReactDOM.createRoot(document.getElementById('root')).render(<Component />);
  </script>
</body>
</html>`;

  return (
    <iframe srcDoc={srcDoc} sandbox="allow-scripts" className="h-full w-full border-0 bg-white" />
  );
}
