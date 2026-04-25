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
          <span className="peer-checked:bg-[#3182F6] peer-checked:text-white border border-[#D1D6DB] peer-checked:border-[#3182F6] rounded-md px-3 py-1.5 text-sm text-[#333D4B] select-none hover:border-[#3182F6] transition-colors">
            {option}
          </span>
        </label>
      ))}
    </div>
  );
}
