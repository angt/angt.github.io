'use strict';

function Cargo(capacity = {}) {
    return {
        _capacity: { ...capacity },
        _contents: {},

        capacity(type) {
            return this._capacity[type] ?? 0;
        },

        get(type) {
            return this._contents[type] ?? 0;
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

        isEmpty() {
            for (const type in this._contents) {
                if (this._contents[type] > 0) return false;
            }
            return true;
        },

        scale(factor) {
            for (const type in this._capacity) {
                this._capacity[type] = Math.floor(this._capacity[type] * factor);
            }
            for (const type in this._contents) {
                if (this._capacity[type] !== undefined && this._contents[type] > this._capacity[type]) {
                    this._contents[type] = this._capacity[type];
                }
                if (this._contents[type] <= 0) delete this._contents[type];
            }
            return this;
        },

        add(type, amount) {
            const toAdd = Math.min(amount, this.space(type));
            if (toAdd > 0) {
                this._contents[type] = (this._contents[type] || 0) + toAdd;
            }
            return toAdd;
        },

        remove(type, amount) {
            const toRemove = Math.min(amount, this.get(type));
            if (toRemove > 0) {
                const remaining = this._contents[type] - toRemove;
                if (remaining > 0) {
                    this._contents[type] = remaining;
                } else {
                    delete this._contents[type];
                }
            }
            return toRemove;
        },

        fill() {
            for (const type in this._capacity) {
                this._contents[type] = this._capacity[type];
            }
            return this;
        },

        mergeFrom(other) {
            for (const t in other._capacity) {
                this._capacity[t] = (this._capacity[t] || 0) + other._capacity[t];
            }
            for (const t in other._contents) {
                this._contents[t] = (this._contents[t] || 0) + other._contents[t];
            }
            return this;
        },

        addCapacity(other) {
            const obj = other._capacity || other;
            for (const t in obj) {
                this._capacity[t] = (this._capacity[t] || 0) + obj[t];
            }
            return this;
        },

        canAfford(costObj) {
            const cost = costObj._capacity || costObj;
            for (const type in cost) {
                if (this.get(type) < cost[type]) return false;
            }
            return true;
        },

        canStore(target) {
            for (const type in this._contents) {
                if (target.space(type) > 0) return true;
            }
            return false;
        },

        storeTo(target) {
            let totalStored = 0;
            for (const type in this._contents) {
                const have = this._contents[type];
                if (have <= 0) continue;
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
