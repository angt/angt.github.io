'use strict';

function Cargo(capacity = {}) {
    return {
        _capacity: { ...capacity },
        _contents: {},

        capacity(type) {
            return this._capacity[type] ?? this._capacity.default ?? 0;
        },

        get(type) {
            return this._contents[type] || 0;
        },

        space(type) {
            return this.capacity(type) - this.get(type);
        },

        hasSpace(type, amount = 1) {
            return this.space(type) >= amount;
        },

        hasAnySpace() {
            for (const type in this._capacity) {
                if (this.space(type) > 0) return true;
            }
            return false;
        },

        types() {
            return Object.keys(this._contents).filter(t => this._contents[t] > 0);
        },

        total() {
            return this.types().reduce((sum, t) => sum + this._contents[t], 0);
        },

        isEmpty() {
            return this.types().length === 0;
        },

        _trim(type) {
            if (this._contents[type] > this._capacity[type]) {
                this._contents[type] = this._capacity[type];
            }
            if (this._contents[type] <= 0) delete this._contents[type];
            return this;
        },

        _trimAll(types) {
            for (const t of types) {
                this._trim(t);
            }
            return this;
        },

        scale(factor) {
            for (const type in this._capacity) {
                this._capacity[type] = Math.floor(this._capacity[type] * factor);
            }
            this._trimAll(Object.keys(this._contents));
            return this;
        },

        add(type, amount) {
            const space = this.space(type);
            const toAdd = Math.min(amount, space);
            if (toAdd > 0) {
                this._contents[type] = (this._contents[type] || 0) + toAdd;
            }
            return toAdd;
        },

        remove(type, amount) {
            const have = this.get(type);
            const toRemove = Math.min(amount, have);
            this._contents[type] = have - toRemove;
            if (this._contents[type] <= 0) delete this._contents[type];
            return toRemove;
        },

        removeAll(type) {
            const amount = this.get(type);
            delete this._contents[type];
            return amount;
        },

        clear() {
            this._contents = {};
        },

        fill() {
            for (const type in this._capacity) {
                this._contents[type] = this._capacity[type];
            }
            return this;
        },

        mergedWith(other) {
            const mergedCapacity = { ...this._capacity };
            for (const t in other._capacity) {
                mergedCapacity[t] = (mergedCapacity[t] || 0) + other._capacity[t];
            }
            const result = Cargo(mergedCapacity);
            for (const t in this._contents) {
                result._contents[t] = this._contents[t];
            }
            for (const t of other.types()) {
                result.add(t, other.get(t));
            }
            return result;
        },

        addCapacity(type, amount) {
            if (typeof type === 'object' && amount === undefined) {
                for (const t in type) {
                    this._capacity[t] = (this._capacity[t] || 0) + type[t];
                }
            } else {
                this._capacity[type] = (this._capacity[type] || 0) + amount;
            }
            return this;
        },

        canStore(target) {
            return this.types().some(type => target.space(type) > 0);
        },

        storeTo(target) {
            let totalStored = 0;

            for (const type of this.types()) {
                const have = this.get(type);
                const stored = target.add(type, have);

                if (stored > 0) {
                    this._contents[type] = have - stored;
                    if (this._contents[type] <= 0) delete this._contents[type];
                    totalStored += stored;
                }
            }

            return totalStored;
        },

        clone(withContents = false) {
            const copy = Cargo(this._capacity);
            if (withContents) {
                for (const t in this._contents) {
                    copy._contents[t] = this._contents[t];
                }
            }
            return copy;
        }
    };
}
