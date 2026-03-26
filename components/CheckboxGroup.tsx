"use client";

export function CheckboxGroup({
  name,
  options,
  defaultValues = [],
}: {
  name: string;
  options: string[];
  defaultValues?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option}
          className="flex items-center gap-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            name={`${name}_${option}`}
            value={option}
            defaultChecked={defaultValues.includes(option)}
            className="hidden peer"
          />
          <span className="peer-checked:bg-[#1a2e4a] peer-checked:text-white border border-gray-300 peer-checked:border-[#1a2e4a] rounded-md px-3 py-1.5 text-sm text-gray-700 select-none hover:border-[#1a2e4a] transition-colors">
            {option}
          </span>
        </label>
      ))}
    </div>
  );
}
