interface Props {
  onInject: (type: "jamming" | "spoofing") => void;
}

export default function ControlPanel({ onInject }: Props) {
  return (
    <div>
      <h2 className="text-white font-semibold mb-3">Attack Injection</h2>
      <div className="flex gap-3">
        <button
          onClick={() => onInject("jamming")}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium transition"
        >
          Inject Jamming
        </button>
        <button
          onClick={() => onInject("spoofing")}
          className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-lg font-medium transition"
        >
          Inject Spoofing
        </button>
      </div>
    </div>
  );
}
