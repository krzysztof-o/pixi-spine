var spine = require('../SpineUtil');
spine.Bone = require('./Bone');
spine.Slot = require('./Slot');
spine.IkConstraint = require('./IkConstraint');
spine.Skeleton = function (skeletonData)
{
    this.data = skeletonData;

    this.bones = [];
    for (var i = 0, n = skeletonData.bones.length; i < n; i++)
    {
        var boneData = skeletonData.bones[i];
        var parent = !boneData.parent ? null : this.bones[skeletonData.bones.indexOf(boneData.parent)];
        this.bones.push(new spine.Bone(boneData, this, parent));
    }

    this.slots = [];
    this.drawOrder = [];
    for (var i = 0, n = skeletonData.slots.length; i < n; i++)
    {
        var slotData = skeletonData.slots[i];
        var bone = this.bones[skeletonData.bones.indexOf(slotData.boneData)];
        var slot = new spine.Slot(slotData, bone);
        this.slots.push(slot);
        this.drawOrder.push(i);
    }

    this.ikConstraints = [];
    for (var i = 0, n = skeletonData.ikConstraints.length; i < n; i++)
        this.ikConstraints.push(new spine.IkConstraint(skeletonData.ikConstraints[i], this));

    this.transformConstraints = [];
    for (var i = 0, n = skeletonData.transformConstraints.length; i < n; i++)
        this.transformConstraints.push(new spine.TransformConstraint(skeletonData.transformConstraints[i], this));

    this.boneCache = [];
    this.updateCache();
};
spine.Skeleton.prototype = {
    x: 0, y: 0,
    skin: null,
    r: 1, g: 1, b: 1, a: 1,
    time: 0,
    flipX: false, flipY: false,
    /** Caches information about bones and IK constraints. Must be called if bones or IK constraints are added or removed. */
    updateCache: function ()
    {
        var ikConstraints = this.ikConstraints;
        var ikConstraintsCount = ikConstraints.length;
        var transformConstraints = this.transformConstraints;
        var transformConstraintsCount = transformConstraints.length;

        var boneCache = this.boneCache;
        boneCache.length = 0;
        var bones = this.bones;
        for (var i = 0, n = bones.length; i < n; i++)
        {
            var bone = bones[i];
            boneCache.push(bone);
            for (var j=0; j < transformConstraintsCount; j++) {
                if (transformConstraints[j].bone == bone) {
                    boneCache.push(transformConstraints[j]);
                }
            }
            for (var j=0; j < ikConstraintsCount; j++) {
                if (ikConstraints[j].bones[ikConstraints[j].bones.length-1] == bone) {
                    boneCache.push(ikConstraints[j]);
                    break;
                }
            }
        }
    },
    /** Updates the world transform for each bone. */
    updateWorldTransform: function ()
    {
        var bones = this.bones;
        for (var i = 0, n = bones.length; i < n; i++)
        {
            var bone = bones[i];
            bone.rotationIK = bone.rotation;
        }
        var boneCache = this.boneCache;
        for (var i = 0, n = boneCache.length; i < n; i++) {
            boneCache[i].update();
        }
    },
    /** Sets the bones and slots to their setup pose values. */
    setToSetupPose: function ()
    {
        this.setBonesToSetupPose();
        this.setSlotsToSetupPose();
    },
    setBonesToSetupPose: function ()
    {
        var bones = this.bones;
        for (var i = 0, n = bones.length; i < n; i++)
            bones[i].setToSetupPose();

        var ikConstraints = this.ikConstraints;
        for (var i = 0, n = ikConstraints.length; i < n; i++)
        {
            var ikConstraint = ikConstraints[i];
            ikConstraint.bendDirection = ikConstraint.data.bendDirection;
            ikConstraint.mix = ikConstraint.data.mix;
        }

        var transformConstraints = this.transformConstraints;
        for (var i = 0, n = transformConstraints.length; i < n; i++)
        {
            var constraint = transformConstraints[i];
            var data = constraint.data;
            constraint.rotateMix = data.rotateMix;
            constraint.translateMix = data.translateMix;
            constraint.scaleMix = data.scaleMix;
            constraint.shearMix = data.shearMix;
        }
    },
    setSlotsToSetupPose: function ()
    {
        var slots = this.slots;
        for (var i = 0, n = slots.length; i < n; i++)
        {
            slots[i].setToSetupPose(i);
        }

        this.resetDrawOrder();
    },
    /** @return May return null. */
    getRootBone: function ()
    {
        return this.bones.length ? this.bones[0] : null;
    },
    /** @return May be null. */
    findBone: function (boneName)
    {
        var bones = this.bones;
        for (var i = 0, n = bones.length; i < n; i++)
            if (bones[i].data.name == boneName) return bones[i];
        return null;
    },
    /** @return -1 if the bone was not found. */
    findBoneIndex: function (boneName)
    {
        var bones = this.bones;
        for (var i = 0, n = bones.length; i < n; i++)
            if (bones[i].data.name == boneName) return i;
        return -1;
    },
    /** @return May be null. */
    findSlot: function (slotName)
    {
        var slots = this.slots;
        for (var i = 0, n = slots.length; i < n; i++)
            if (slots[i].data.name == slotName) return slots[i];
        return null;
    },
    /** @return -1 if the bone was not found. */
    findSlotIndex: function (slotName)
    {
        var slots = this.slots;
        for (var i = 0, n = slots.length; i < n; i++)
            if (slots[i].data.name == slotName) return i;
        return -1;
    },
    setSkinByName: function (skinName)
    {
        var skin = this.data.findSkin(skinName);
        if (!skin) throw "Skin not found: " + skinName;
        this.setSkin(skin);
    },
    /** Sets the skin used to look up attachments before looking in the {@link SkeletonData#getDefaultSkin() default skin}.
     * Attachments from the new skin are attached if the corresponding attachment from the old skin was attached. If there was
     * no old skin, each slot's setup mode attachment is attached from the new skin.
     * @param newSkin May be null. */
    setSkin: function (newSkin)
    {
        if (newSkin)
        {
            if (this.skin)
                newSkin._attachAll(this, this.skin);
            else
            {
                var slots = this.slots;
                for (var i = 0, n = slots.length; i < n; i++)
                {
                    var slot = slots[i];
                    var name = slot.data.attachmentName;
                    if (name)
                    {
                        var attachment = newSkin.getAttachment(i, name);
                        if (attachment) slot.setAttachment(attachment);
                    }
                }
            }
        }
        this.skin = newSkin;
    },
    /** @return May be null. */
    getAttachmentBySlotName: function (slotName, attachmentName)
    {
        return this.getAttachmentBySlotIndex(this.data.findSlotIndex(slotName), attachmentName);
    },
    /** @return May be null. */
    getAttachmentBySlotIndex: function (slotIndex, attachmentName)
    {
        if (this.skin)
        {
            var attachment = this.skin.getAttachment(slotIndex, attachmentName);
            if (attachment) return attachment;
        }
        if (this.data.defaultSkin) return this.data.defaultSkin.getAttachment(slotIndex, attachmentName);
        return null;
    },
    /** @param attachmentName May be null. */
    setAttachment: function (slotName, attachmentName)
    {
        var slots = this.slots;
        for (var i = 0, n = slots.length; i < n; i++)
        {
            var slot = slots[i];
            if (slot.data.name == slotName)
            {
                var attachment = null;
                if (attachmentName)
                {
                    attachment = this.getAttachmentBySlotIndex(i, attachmentName);
                    if (!attachment) throw "Attachment not found: " + attachmentName + ", for slot: " + slotName;
                }
                slot.setAttachment(attachment);
                return;
            }
        }
        throw "Slot not found: " + slotName;
    },
    /** @return May be null. */
    findIkConstraint: function (constraintName)
    {
        var constraints = this.ikConstraints;
        for (var i = 0, n = constraints.length; i < n; i++)
            if (constraints[i].data.name == constraintName) return constraints[i];
        return null;
    },
    findTransformConstraint: function (constraintName)
    {
        var constraints = this.transformConstraints;
        for (var i = 0, n = constraints.length; i < n; i++)
            if (constraints[i].data.name == constraintName) return constraints[i];
        return null;
    },
    update: function (delta)
    {
        this.time += delta;
    },
    resetDrawOrder: function () {
        for (var i = 0, n = this.drawOrder.length; i < n; i++)
        {
            this.drawOrder[i] = i;
        }
    }
};
module.exports = spine.Skeleton;

