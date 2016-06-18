"use strict";

const RED = 0;
const GREEN = 1;
const BLUE = 2;
const BORDER_ENERGY = 1000;

/** Seam carver removes low energy seams in an image from HTML5 canvas. */
class SeamCarver {

    /**
     *
     * Init seam carver
     *
     * @param {HMLT5 canvas} canvas canvas with image on it.
     *
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        this.context = canvas.getContext("2d");
        this.imageData = this.context.getImageData(0, 0, this.width, this.height);
        this.picture = this.imageData.data;

        // Simple implementation of energy matrix as array of arrays.
        // Because we need to remove items, when removing the seam,
        // maybe some sort of linked structure is more efficient.
        this.energy_matrix = new Array(this.width);
        for (var i = 0; i < this.width; i++) {
            this.energy_matrix[i] = new Array(this.height);
        }

        console.log('calculating energy matrix values ...');

        this.createEnergyMatrix();

        console.log('done');
    }

    /**
     * Converts pixel to index.
     *
     * @param {number} x The x val
     * @param {number} y The y val
     * @return {number} Index of 1D array
     *
     */
    pixelToIndex(x, y) {
        if (x < 0 || x >= (this.width * 4) || y < 0 || y >= this.height) {
            throw new Error('IndexOutOfBoundsException : ' +  x + ',' + y);
        }
        // * 4 for rgba
        return ((y * this.width) + x) * 4;
    }

    indexToX(index) {
        return parseInt((index / 4) % this.width);
    }

    indexToY(index) {
        return parseInt(index / (this.width * 4));
    }


    rgbToNum(red, green, blue) {
        var rgb = red;
        rgb = (rgb << 8) + green;
        rgb = (rgb << 8) + blue;
        return rgb;
    }

    numToRgb(num) {
        var red = (num >> 16) & 0xFF;
        var green = (num >> 8) & 0xFF;
        var blue = num & 0xFF;
        return [red, green, blue];
    }

    isBorderPixel(x, y) {
        return (x <= 0 || y <= 0 || x >= this.width-1 || y >= this.height-1);
    }

    pixelInRange(x, y) {
        return (x >= 0 && y >= 0 && x <= this.width-1 && y <= this.height-1);
    }

    /**
     * Energy for single pixel.
     *
     * @param {number} x The x val.
     * @param {number} y The y val.
     * @return {number} The energy val.
     */
    energy(x, y) {
        if (this.isBorderPixel(x, y)) {
            return BORDER_ENERGY;
        }

        var pos_xant = this.pixelToIndex(x - 1, y);
        var pos_xpost = this.pixelToIndex(x + 1, y);
        var pos_yant = this.pixelToIndex(x, y - 1);
        var pos_ypost = this.pixelToIndex(x, y + 1);

        var p = this.picture; // Just to make it more readable ...

        var score = Math.sqrt(
            (p[pos_xpost+RED] - p[pos_xant+RED])*(p[pos_xpost+RED] - p[pos_xant+RED]) +
            (p[pos_xpost+GREEN] - p[pos_xant+GREEN])*(p[pos_xpost+GREEN] - p[pos_xant+GREEN]) +
            (p[pos_xpost+BLUE] - p[pos_xant+BLUE])*(p[pos_xpost+BLUE] - p[pos_xant+BLUE]) +
            (p[pos_ypost+RED] - p[pos_yant+RED])*(p[pos_ypost+RED] - p[pos_yant+RED]) +
            (p[pos_ypost+GREEN] - p[pos_yant+GREEN])*(p[pos_ypost+GREEN] - p[pos_yant+GREEN]) +
            (p[pos_ypost+BLUE] - p[pos_yant+BLUE])*(p[pos_ypost+BLUE] - p[pos_yant+BLUE])
        );
        return score;
    }

    /**
     * Calculate energy_matrix information for pixel x,y.
     * Assumes x and y in range.
     */
    recalculate(x, y) {
        var energy_cell = {};

        energy_cell.energy = this.energy(x, y);
        energy_cell.vminsum = Number.POSITIVE_INFINITY;

        // last row
        if (y >= this.height-1) {
            energy_cell.vminsum = energy_cell.energy;
            energy_cell.minx = 0;
        } else {
            var cursum = 0;
            var curminx = 0;

            // below left
            if (x - 1 >= 0) {
                energy_cell.vminsum = this.energy_matrix[x - 1][y + 1].vminsum + energy_cell.energy;
                energy_cell.minx = x - 1;
            }

            // below
            if (x < this.width) {
                cursum = this.energy_matrix[x][y + 1].vminsum + energy_cell.energy;
                if (cursum < energy_cell.vminsum) {
                    energy_cell.vminsum = cursum;
                    energy_cell.minx = x;
                }
            }

            // below right
            if (x + 1 < this.width) {
                cursum = this.energy_matrix[x + 1][y + 1].vminsum + energy_cell.energy;
                if (cursum < energy_cell.vminsum) {
                    energy_cell.vminsum = cursum;
                    energy_cell.minx = x + 1;
                }
            }
        }

        return energy_cell;
    }

    /**
     * Iterate from bottom to top. For each pixel calculate:
     *     * The energy for the pixel.
     *     * From the three pixels below the current pixel, calculate the
     *       `minx` pixel. The `minx` pixel is the pixel with the smallest
     *       cumulative energy (defined below).
     *     * Set the cumulative energy for this pixel as the energy of this
     *       pixel plus the cumulative energy of th `minx` pixel.
     *
     * The cumulative energy of the pixels in the bottom row is simply its own
     * energy.
     *
     */
    createEnergyMatrix() {
        // This has to be reverse order (bottom to top)
        for (var y = this.height - 1; y >= 0; y--) {
            // This can be in any order ...
            for (var x = 0; x < this.width; x++) {
                this.energy_matrix[x][y] = this.recalculate(x,y);
            }
        }
    }

    /**
     * Backtrack from smallest on first row to choosing always smallest child.
     *
     */
    findVerticalSeam() {
        var vseam = [];

        var xminsum = 0;
        var vminsum = Number.POSITIVE_INFINITY;

        // Find smallest sum on first row
        for (var x = 0; x < this.width; x++) {
            if (this.energy_matrix[x][0].vminsum < vminsum) {
                vminsum = this.energy_matrix[x][0].vminsum;
                xminsum = x;
            }
        }

        vseam[0] = xminsum;

        // Follow down to get array
        var y = 0;
        while (y < this.height - 1) {
            xminsum = this.energy_matrix[xminsum][y].minx
            y++;
            vseam[y] = xminsum;
        }

        return vseam;
    }

    /**
     * Remove pixels from rgb, energy and vminsum representations
     * of image.
     *
     */
    removePixelsFromDataStructures(vseam) {
        this.imageData = this.context.createImageData(this.width - 1, this.height);
        for (var row = this.height - 1; row >= 0; row--) {
            var deletedCol = vseam[row];

            // copy across pixels before seam col
            for (var col = 0; col < deletedCol; col ++) {
                var oldPos = this.pixelToIndex(col, row);
                var pos = oldPos - (row * 4)
                for (var i = 0; i < 4; i ++) {
                    this.imageData.data[pos + i] = this.picture[oldPos + i];
                }
            }

            // Start at deleted col
            // Can ignore last column as we will delete it
            for (var col = deletedCol; col < this.width - 1; col ++) {

                // copy across pixels after seam col
                var pos = this.pixelToIndex(col, row) - (row * 4);
                var pos_right = this.pixelToIndex(col + 1, row);
                for (var i = 0; i < 4; i ++) {
                    this.imageData.data[pos + i] = this.picture[pos_right + i];
                }

                // copy across energy_matrix
                var val_right = this.energy_matrix[col + 1][row];
                val_right.minx--;
                this.energy_matrix[col][row] = val_right;
            }
        }

        this.energy_matrix.splice(this.width - 1, 1)
        this.picture = this.imageData.data;
        this.width--;
    }

    /**
     * Recalculate energy only when necessary: pixels adjacent
     * (up, down and both sides) to the removed seam, ie the affected
     * pixels.
     * For any affected pixel, if the new energy is less than the previous one
     * it's vmin sum must be recalculated therefore it is added to an array
     * and returned by this method.
     *
     * @return {list} List of affected pixels for which the vminsum may be affected.
     */
    recalculateEnergiesAndFindAffectedPixels(vseam) {
        var queue = [];

        for (var row = this.height - 2; row >= 0; row--) {
            var deletedCol = vseam[row];

            // TODO: check this covers all cases (up, down, left, right)
            for (var i = -2; i < 3; i ++) {
                var col = deletedCol + i;

                if (this.pixelInRange(col, row)) {
                    var oldValue = this.energy_matrix[col][row];
                    var newValue = this.recalculate(col, row);
                    this.energy_matrix[col][row] = newValue;
                    // enqueue pixel in range
                    queue.push(this.pixelToIndex(col, row));
                }
            }
        }
        return queue;
    }

    /**
     * Recalculate vminsum for affected pixels
     */
    recalculateVminsumForAffectedPixels(queue) {
        var marked = {};
        var maxRow = -1;
        // used later in loop so as not to go past borders
        var lastCol = (this.width * 4) - 1;

        while (queue.length > 0) {

            // This iterates in topological order because:
            //  * The inital queue was compiled while iterating by row.
            //  * We are iterating by BFS, ie children are at the end of the
            //  queue.
            // TODO: unit test to guarantee this
            var pixelIndex = queue.shift();

            // already explored this pixel
            if (marked[pixelIndex]) continue;

            marked[pixelIndex] = true;

            var col = this.indexToX(pixelIndex);
            var row = this.indexToY(pixelIndex);
            var node = this.energy_matrix[col][row];
            var oldVminsum = node.vminsum;
            node.vminsum = Number.POSITIVE_INFINITY;

            // check three parents in row below
            for (var i = Math.max(col - 1, 0); i < Math.min(col + 1, lastCol); i ++) {
                var parent = this.energy_matrix[i][row + 1];
                var new_vminsum = parent.vminsum + node.energy;

                // TODO: do I always need to update the vminsum for this node?
                if (new_vminsum < node.vminsum) {
                    node.vminsum = new_vminsum;
                    node.minx = i;
                }
            }

            if (oldVminsum !== node.vminsum && row > 0) {
                // TODO: do I need to enqueue all children
                // found better path from parent
                // so enqueue three affected children from row above
                for (var i = Math.max(col - 1, 0); i < Math.min(col + 1, lastCol); i ++) {
                    queue.push(this.pixelToIndex(i, row - 1));
                }
            }
        }
    }

    /**
     * Removes vertical seam.
     * Recalculates pixels depending on removed pixel.
     */
    removeVerticalSeam(vseam) {
        this.removePixelsFromDataStructures(vseam);

        var affectedPixels = this.recalculateEnergiesAndFindAffectedPixels(vseam);

        this.recalculateVminsumForAffectedPixels(affectedPixels);
    }

    reDrawImage() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = this.imageData.width;
        this.canvas.height = this.imageData.height;
        this.canvas.style.width = this.imageData.width + 'px';
        this.canvas.style.height = this.imageData.height + 'px';
        this.context.putImageData(this.imageData, 0, 0);
    }

    /**
     * Prints one of the values of the energy_matrix. Useful for debugging.
     */
    printMatrix(field) {
        console.log(this.toString(field));
    }


    /**
     * Returns string of internal matrix
     */
    toString(field) {
        field = field || 'rgb';
        var lines = '';
        if (field === 'rgb') {
            for (var y = 0; y < this.height; y ++) {
                for (var x = 0; x < this.width; x ++) {
                    var pos = this.pixelToIndex(x, y)
                    var rgb = Array.prototype.slice.call(this.picture, pos, pos + 3);
                    lines += (this.rgbToNum(rgb[0], rgb[1], rgb[2]) / 100000).toFixed(2) + '\t';
                }
                lines += '\n';
            }
        } else {
            for (var y = 0; y < this.height; y++) {
                for (var x = 0; x < this.width; x++) {
                    var val = this.energy_matrix[x][y];
                    if (val && field in val) {
                        lines += val[field].toFixed(2) + "\t";
                    } else {
                        lines += '-----\t';
                    }
                }
                lines += '\n';
            }
        }
        return lines;
    }
}

module.exports = SeamCarver;
